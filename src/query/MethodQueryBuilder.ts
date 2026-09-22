import { Condition } from "../query/Condition";
import { OrderBySelector } from "../query/selectors";
import {
  FilterDescriptor,
  OrderLimitOffsetExtract,
  QueryAction,
  QueryAssist,
  QueryClause,
} from "./types";
import { OperatorsMap, getOperatorArity } from "./utils";
import { Context } from "@decaf-ts/db-decorators";
import { LoggedClass, Logger, Logging } from "@decaf-ts/logging";
import { OrderDirection } from "../repository/constants";
import { QueryError } from "./errors";

const lowerFirst = (str: string): string =>
  str.charAt(0).toLowerCase() + str.slice(1);

/**
 * Comparison-operator suffix marker used by the exists naming convention to
 * fail closed when a comparison-shaped field token receives a call value.
 */
const COMPARISON_SUFFIX =
  /(Equals|Diff|LessThan|LessThanEqual|GreaterThan|GreaterThanEqual|BiggerThan|SmallerThan|Bigger|Smaller|Between|In|Exists|Matches|Regexp|Not)$/;

export type QueryActionPrefix = {
  action: QueryAction;
  prefix: string;
};

/**
 * @description
 * Utility class to build query objects from repository method names.
 *
 * @summary
 * The `MethodQueryBuilder` class parses method names that follow a specific naming convention
 * (e.g., `findByNameAndAgeOrderByCountryAsc`) and converts them into structured query objects
 * (`QueryAssist`). It extracts clauses such as `select`, `where`, `groupBy`, `orderBy`, `limit`,
 * and `offset`, ensuring that developers can declare repository queries using expressive method names.
 *
 * @param methodName {string} - The repository method name to parse and convert into a query.
 * @param values {any[]} - The values corresponding to method parameters used for query conditions.
 *
 * @return {QueryAssist} A structured query object describing the parsed action, select, where,
 * groupBy, orderBy, limit, and offset clauses.
 *
 * @class
 *
 * @example
 * ```ts
 * const query = MethodQueryBuilder.build(
 *   "findByNameAndAgeOrderByCountryAsc",
 *   "John",
 *   25,
 *   [["country", "ASC"]]
 * );
 *
 * console.log(query);
 * // {
 * //   action: "find",
 * //   select: undefined,
 * //   where: { ... },
 * //   groupBy: undefined,
 * //   orderBy: [["country", "ASC"]],
 * //   limit: undefined,
 * //   offset: undefined
 * // }
 * ```
 *
 * @example
 * ```ts
 * // Existence methods follow the `existsBy<Field>` convention: the fields are
 * // asserted to be defined, no comparison values are consumed, and the action
 * // is `"exists"` (resolving to `Promise<boolean>` at the repository level).
 * const existsQuery = MethodQueryBuilder.build("existsByNameAndAge");
 *
 * console.log(existsQuery);
 * // {
 * //   action: "exists",
 * //   select: undefined,
 * //   where: {
 * //     ...name EXISTS condition and-ed with age EXISTS condition...
 * //   },
 * //   groupBy: undefined,
 * //   orderBy: undefined,
 * //   limit: undefined,
 * //   offset: undefined
 * // }
 * ```
 *
 * @mermaid
 * sequenceDiagram
 *   participant Repo as Repository Method
 *   participant MQB as MethodQueryBuilder
 *   participant Query as QueryAssist
 *
 *   Repo->>MQB: build(methodName, ...values)
 *   MQB->>MQB: extractCore(methodName)
 *   MQB->>MQB: extractSelect(methodName)
 *   MQB->>MQB: extractGroupBy(methodName)
 *   MQB->>MQB: buildWhere(core, values, action)
 *   MQB->>MQB: extractOrderLimitOffset(core, values)
 *   MQB->>Query: return structured QueryAssist object
 */
export class MethodQueryBuilder extends LoggedClass {
  private static _logger: Logger;

  protected static get log(): Logger {
    if (!this._logger) this._logger = Logging.for(MethodQueryBuilder.name);
    return this._logger;
  }

  /**
   * @description
   * Map of query prefixes to their corresponding actions.
   */
  private static readonly prefixMap: Record<string, QueryAction> = {
    [QueryClause.FIND_BY]: "find",
    [QueryClause.PAGE_BY]: "page",
    [QueryClause.COUNT_BY]: "count",
    [QueryClause.SUM_BY]: "sum",
    [QueryClause.AVG_BY]: "avg",
    [QueryClause.MIN_BY]: "min",
    [QueryClause.MAX_BY]: "max",
    [QueryClause.DISTINCT_BY]: "distinct",
    [QueryClause.GROUP_BY_PREFIX]: "group",
    [QueryClause.EXISTS_BY]: "exists",
  };

  /**
   * @description
   * Determines the action and prefix length from a method name.
   *
   * @param methodName {string} - The repository method name.
   * @return {QueryActionPrefix} | undefined} The action and prefix if found.
   */
  private static getActionFromMethodName(
    methodName: string
  ): QueryActionPrefix | undefined {
    for (const [prefix, action] of Object.entries(this.prefixMap)) {
      if (methodName.startsWith(prefix)) {
        return { action, prefix };
      }
    }
    return undefined;
  }

  /**
   * @description
   * Builds a `QueryAssist` object by parsing a repository method name and values.
   *
   * @summary
   * The method validates the method name, extracts clauses (core, select, groupBy, where,
   * orderBy, limit, and offset), and assembles them into a structured query object
   * that can be executed against a data source.
   *
   * @param methodName {string} - The repository method name that encodes query information.
   * @param values {any[]} - The values corresponding to conditions and extra clauses.
   *
   * @return {QueryAssist} A structured query object representing the parsed query.
   */
  static build(methodName: string, ...values: any[]): QueryAssist {
    const actionInfo = this.getActionFromMethodName(methodName);
    if (!actionInfo) {
      throw new QueryError(`Unsupported method ${methodName}`);
    }

    const { action, prefix } = actionInfo;

    // For aggregation methods (count, sum, avg, min, max, distinct), extract the selector field
    let selector: string | undefined;
    if (
      ["count", "sum", "avg", "min", "max", "distinct", "group"].includes(
        action
      )
    ) {
      selector = this.extractAggregationSelector(methodName, prefix);
    }

    const core = this.extractCore(methodName, prefix);
    const select = this.extractSelect(methodName);
    const groupBy = this.extractGroupBy(methodName);
    const where = this.buildWhere(core, values, action);
    const { orderBy, limit, offset } = this.extractOrderLimitOffset(
      methodName,
      values,
      core
    );

    return {
      action,
      select,
      selector,
      where,
      groupBy,
      orderBy,
      limit,
      offset,
    };
  }

  /**
   * @description
   * Extracts the aggregation selector field from method names like countByAge, sumByPrice.
   *
   * @param methodName {string} - The method name.
   * @param prefix {string} - The prefix to remove.
   * @return {string | undefined} The selector field name.
   */
  private static extractAggregationSelector(
    methodName: string,
    prefix: string
  ): string | undefined {
    const afterPrefix = methodName.substring(prefix.length);
    // Find where the selector ends (at next clause keyword, operator, or end)
    // Include ThenBy for groupBy prefix
    const regex = /(And|Or|GroupBy|OrderBy|Select|Limit|Offset|ThenBy)/;
    const match = afterPrefix.match(regex);
    const selectorPart = match
      ? afterPrefix.substring(0, match.index)
      : afterPrefix;
    return selectorPart ? lowerFirst(selectorPart) : undefined;
  }

  /**
   * @description
   * Extracts the core part of the method name after the prefix and before any special clauses.
   *
   * @summary
   * Removes prefixes and detects delimiters (`Then`, `OrderBy`, `GroupBy`, `Limit`, `Offset`)
   * to isolate the main conditional part of the query.
   *
   * @param methodName {string} - The method name to parse.
   * @param prefix {string} - The prefix to remove (e.g., "findBy", "countBy").
   *
   * @return {string} The extracted core string used for building conditions.
   */
  private static extractCore(
    methodName: string,
    prefix: string = QueryClause.FIND_BY
  ): string {
    const afterPrefix = methodName.substring(prefix.length);

    // For aggregation methods (not findBy, pageBy or existsBy), we need to skip the selector field
    const isAggregationPrefix =
      prefix !== QueryClause.FIND_BY &&
      prefix !== QueryClause.PAGE_BY &&
      prefix !== QueryClause.EXISTS_BY;

    if (isAggregationPrefix) {
      // For aggregation methods, we need to find where actual conditions start
      // Conditions are indicated by And|Or AFTER the selector field
      // For "countByAgeAndNameEquals", conditions start at "AndNameEquals"
      // For "sumByPriceGroupByCategory", there are no conditions

      // First, identify the selector field boundary
      // The selector ends at: And, Or, GroupBy, OrderBy, ThenBy, Select, Limit, Offset
      const selectorEndMatch = afterPrefix.match(
        /(And|Or|GroupBy|OrderBy|ThenBy|Select|Limit|Offset)/
      );

      if (!selectorEndMatch) {
        // No delimiter found, entire suffix is the selector, no conditions
        return "";
      }

      // Check if the first delimiter is And or Or (indicating a condition)
      if (selectorEndMatch[0] === "And" || selectorEndMatch[0] === "Or") {
        // Extract everything AFTER the And/Or (skip the And/Or itself for the first condition)
        const afterAndOr = afterPrefix.substring(
          selectorEndMatch.index! + selectorEndMatch[0].length
        );

        // Now apply standard delimiter extraction
        const delimiterMatch = afterAndOr.match(
          /(Then[A-Z]|OrderBy|GroupBy|Limit|Offset|Select|ThenBy)/
        );
        return delimiterMatch
          ? afterAndOr.substring(0, delimiterMatch.index)
          : afterAndOr;
      }

      // First delimiter is not And/Or, so there are no conditions
      return "";
    }

    // For findBy and pageBy, extract core normally
    const regex = /(Then[A-Z]|OrderBy|GroupBy|Limit|Offset|Select)/;
    const match = afterPrefix.match(regex);
    const corePart = match
      ? afterPrefix.substring(0, match.index)
      : afterPrefix;

    return corePart;
  }

  static getFieldsFromMethodName(methodName: string): Array<string> {
    const actionInfo = this.getActionFromMethodName(methodName);
    const prefix = actionInfo?.prefix || QueryClause.FIND_BY;
    const core = this.extractCore(methodName, prefix);
    if (!core) return [];
    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    const conditions = parts.split(/And|Or/);
    return conditions
      .filter((token) => token.length > 0)
      .map((token) => {
        const { operator, field } = this.parseFieldAndOperator(token);
        return field + (operator ?? "");
      });
  }

  /**
   * @description
   * Extracts the select clause from a method name.
   *
   * @summary
   * Detects the `Select` keyword in the method name, isolates the fields following it,
   * and returns them as an array of lowercase-first strings.
   *
   * @param methodName {string} - The method name to parse.
   *
   * @return {string[] | undefined} An array of selected fields or `undefined` if no select clause exists.
   */
  private static extractSelect(methodName: string): string[] | undefined {
    const selectIndex = methodName.indexOf(QueryClause.SELECT);
    if (selectIndex === -1) return undefined;

    const afterSelect = methodName.substring(
      selectIndex + QueryClause.SELECT.length
    );

    // Search for next Then, GroupBy, OrderBy...
    const match = afterSelect.match(/(Then[A-Z]|OrderBy|GroupBy|Limit|Offset)/);

    const selectPart = match
      ? afterSelect.substring(0, match.index)
      : afterSelect;

    return selectPart.split(QueryClause.AND).map(lowerFirst).filter(Boolean);
  }

  /**
   * @description
   * Extracts the group by clause from a method name.
   *
   * @summary
   * Detects the `GroupBy` keyword in the method name, isolates the fields following it,
   * and returns them as an array of lowercase-first strings.
   *
   * @param methodName {string} - The method name to parse.
   *
   * @return {string[] | undefined} An array of group by fields or `undefined` if no group by clause exists.
   */
  private static extractGroupBy(methodName: string): string[] | undefined {
    // First check for the standard "GroupBy" clause (e.g., findByActiveGroupByCountry)
    const groupByIndex = methodName.indexOf(QueryClause.GROUP_BY);
    if (groupByIndex !== -1) {
      const after = methodName.substring(
        groupByIndex + QueryClause.GROUP_BY.length
      );
      const groupByPart = after.split(QueryClause.ORDER_BY)[0];
      return groupByPart
        .split(QueryClause.THEN_BY)
        .map(lowerFirst)
        .filter(Boolean);
    }

    // For "groupBy" prefix (e.g., groupByCategoryThenByRegion),
    // extract ThenBy fields after the selector
    const actionInfo = this.getActionFromMethodName(methodName);
    if (actionInfo?.action === "group") {
      const afterPrefix = methodName.substring(actionInfo.prefix.length);
      const thenByIndex = afterPrefix.indexOf(QueryClause.THEN_BY);
      if (thenByIndex === -1) return undefined;

      const afterThenBy = afterPrefix.substring(
        thenByIndex + QueryClause.THEN_BY.length
      );
      // Split by ThenBy to get multiple group fields
      const parts = afterThenBy.split(QueryClause.THEN_BY);
      // Also stop at OrderBy, Limit, Offset
      const result: string[] = [];
      for (const part of parts) {
        const match = part.match(/(OrderBy|Limit|Offset|Select)/);
        const field = match ? part.substring(0, match.index) : part;
        if (field) result.push(lowerFirst(field));
      }
      return result.length > 0 ? result : undefined;
    }

    return undefined;
  }

  // private static extractOrderBy(
  //   methodName: string
  // ): OrderBySelector<any>[] | undefined {
  //   const orderByIndex = methodName.indexOf(QueryClause.ORDER_BY);
  //   if (orderByIndex === -1) return undefined;
  //
  //   const after = methodName.substring(
  //     orderByIndex + QueryClause.ORDER_BY.length
  //   );
  //   const orderParts = after.split("ThenBy");
  //
  //   return orderParts.map((part) => {
  //     const match = part.match(/(.*?)(Asc|Desc|Dsc)$/);
  //     if (!match) throw new Error(`Invalid OrderBy part: ${part}`);
  //     const [, field, dir] = match;
  //     return [
  //       lowerFirst(field),
  //       dir.toLowerCase() === "dsc"
  //         ? OrderDirection.DSC
  //         : (dir.toLowerCase() as OrderDirection),
  //     ];
  //   });
  // }

  /**
   * @description
   * Builds the `where` condition object based on the parsed core string and parameter values.
   *
   * @summary
   * Splits the core string by logical operators (`And`, `Or`), parses each token into a field
   * and operator, and combines them into a `Condition` object using the provided values.
   * Each condition consumes as many values as its operator arity dictates (e.g. two for `Between`),
   * so multi-value operators are supported generically.
   *
   * @param core {string} - The extracted core string from the method name.
   * @param values {any[]} - The values corresponding to the conditions.
   * @param action {QueryAction} - The query action the method name encodes.
   *
   * @return {Condition<any>} A structured condition object representing the query's where clause.
   */
  private static buildWhere(
    core: string,
    values: any[],
    action?: QueryAction
  ): Condition<any> | undefined {
    // Empty core means no where conditions
    if (!core) return undefined;

    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    if (!parts) return undefined;

    const conditions = parts.split(/And|Or/).filter((c) => c.length > 0);
    if (conditions.length === 0) return undefined;

    const operators = core.match(/And|Or/g) || [];

    let where: Condition<any> | undefined;
    let valueIndex = 0;

    conditions.forEach((token, idx) => {
      const { field, operator, arity } = this.parseFieldAndOperator(token);
      if (action === "exists") {
        // `existsBy<field>` asserts that the field is defined. An explicit
        // comparison-operator suffix (recognized, e.g. `existsByTenantIdEquals`,
        // or unrecognized, e.g. `existsByAgeBiggerThan`) is not part of the
        // exists contract: reject it instead of silently dropping the
        // comparison filter. Plain `existsBy<field>` keeps the field-existence
        // semantics, and any trailing call values are not part of the condition
        // (matching the delivered `findBy`-style naming convention).
        if (operator && operator !== "Exists") {
          throw new QueryError(
            `Unsupported operator ${operator} for exists action: exists methods assert field existence and do not accept comparison-operator suffixes`
          );
        }
        if (
          values.some((value) => !(value instanceof Context)) &&
          COMPARISON_SUFFIX.test(field)
        ) {
          throw new QueryError(
            `Invalid value for exists action: exists methods assert field existence and do not accept comparison-operator suffixes`
          );
        }
        const existsCondition = Condition.attribute(field as any).exists();
        where =
          idx === 0
            ? existsCondition
            : operators[idx - 1] === QueryClause.AND
              ? where!.and(existsCondition)
              : where!.or(existsCondition);
        return;
      }
      const parser = operator ? OperatorsMap[operator] : OperatorsMap.Equals;
      if (!parser) throw new QueryError(`Unsupported operator ${operator}`);

      const valueArity = arity ?? 1;
      const conditionValues = values.slice(valueIndex, valueIndex + valueArity);
      if (
        conditionValues.length < valueArity ||
        conditionValues.some((value) => typeof value === "undefined")
      ) {
        throw new QueryError(`Invalid value for field ${field}`);
      }
      valueIndex += valueArity;

      const condition = parser(field, ...conditionValues);
      where =
        idx === 0
          ? condition
          : operators[idx - 1] === QueryClause.AND
            ? where!.and(condition)
            : where!.or(condition);
    });

    return where;
  }

  /**
   * @description
   * Parses a field name and operator from a string token.
   *
   * @summary
   * Identifies the operator suffix (if present) and returns a descriptor containing the field
   * name in lowercase-first format along with the operator and the number of values it consumes.
   *
   * @param str {string} - The token string to parse.
   *
   * @return {FilterDescriptor} An object containing the field name, operator, and value arity.
   */
  private static parseFieldAndOperator(str: string): FilterDescriptor {
    for (const operator of Object.keys(OperatorsMap)) {
      if (str.endsWith(operator)) {
        const field = str.slice(0, -operator.length);
        return {
          field: lowerFirst(field),
          operator,
          arity: getOperatorArity(operator),
        };
      }
    }
    return { field: lowerFirst(str), arity: getOperatorArity() };
  }

  private static extractOrderByField(methodName: string): string | undefined {
    // new Regex(`${QueryClause.ORDER_BY}`);
    const match = methodName.match(/OrderBy(.+)$/);
    if (!match) return undefined;
    const field = match[1];
    return field.charAt(0).toLowerCase() + field.slice(1);
  }

  private static getProperlyOrderByOrThrow(
    field: string | undefined,
    direction: OrderDirection | undefined
  ): Array<OrderBySelector<any>> | undefined {
    const log = MethodQueryBuilder.log.for(this.getProperlyOrderByOrThrow);
    // Both absent → ignore OrderBy
    if (!direction && !field) return;

    if (direction && !field)
      throw new QueryError(
        `Expected OrderBy clause, but no sortable field was found in method name.`
      );

    // Field present, but direction is undefined → ignore OrderBy
    if (!direction && field) {
      log.debug("Ignoring OrderBy clause because direction is undefined.");
      return;
    }

    // Both present → validate direction
    const allowedDirections = Object.values(OrderDirection);
    if (!allowedDirections.includes(direction as any)) {
      throw new QueryError(
        `Invalid OrderBy direction ${direction}. Expected one of: ${Object.values(OrderDirection).join(", ")}.`
      );
    }

    return [[field as any, direction as OrderDirection]];
  }

  /**
   * @description
   * Extracts `orderBy`, `limit`, and `offset` clauses from method arguments.
   *
   * @summary
   * Determines the number of condition values (summing each condition's operator arity, so a
   * multi-value `Between` consumes two), then checks the remaining arguments to resolve sorting,
   * limiting, and pagination.
   *
   * @param methodName {string} - The method name.
   * @param values {any[]} - The values corresponding to method arguments, including conditions and extras.
   * @param core {string} - The pre-extracted core string.
   *
   * @return {OrderLimitOffsetExtract} An object containing orderBy, limit, and offset values if present.
   */
  private static extractOrderLimitOffset(
    methodName: string,
    values: any[],
    core?: string
  ): OrderLimitOffsetExtract {
    const coreString = core ?? this.extractCore(methodName);
    const conditionCount = this.countConditionValues(coreString);
    const extraArgs: any[] = values.slice(conditionCount) ?? [];

    let orderBy: Array<OrderBySelector<any>> | undefined;
    let limit: number | undefined;
    let offset: number | undefined;

    if (extraArgs.at(-1) instanceof Context) extraArgs.pop();

    if (extraArgs.length >= 1) {
      const direction = extraArgs[0];
      const field = this.extractOrderByField(methodName);
      orderBy = this.getProperlyOrderByOrThrow(field, direction);
    }

    if (extraArgs.length >= 2 && typeof extraArgs[1] === "number")
      limit = extraArgs[1];

    if (extraArgs.length >= 3 && typeof extraArgs[2] === "number")
      offset = extraArgs[2];

    return { orderBy, limit, offset };
  }

  /**
   * @description
   * Counts how many query values the conditions in a core string consume.
   *
   * @summary
   * Splits the core string by logical operators (`And`, `Or`) and sums the value arity of each
   * condition's operator, so multi-value operators such as `Between` are counted correctly and
   * trailing `orderBy`/`limit`/`offset` arguments remain aligned.
   *
   * @param core {string} - The extracted core string from the method name.
   *
   * @return {number} The number of values consumed by the conditions.
   */
  private static countConditionValues(core: string): number {
    if (!core) return 0;

    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    if (!parts) return 0;

    return parts
      .split(/And|Or/)
      .filter((c) => c.length > 0)
      .reduce(
        (count, token) =>
          count + (this.parseFieldAndOperator(token).arity ?? 1),
        0
      );
  }
}
