import { Condition } from "../query/Condition";
import { OrderBySelector } from "../query/selectors";
import {
  FilterDescriptor,
  OrderLimitOffsetExtract,
  QueryAssist,
  QueryClause,
} from "./types";
import { OperatorsMap } from "./utils";
import { Context } from "@decaf-ts/db-decorators";
import { LoggedClass, Logger, Logging } from "@decaf-ts/logging";
import { OrderDirection } from "../repository/constants";
import { QueryError } from "./errors";

const lowerFirst = (str: string): string =>
  str.charAt(0).toLowerCase() + str.slice(1);

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
 *   MQB->>MQB: buildWhere(core, values)
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
    if (!methodName.startsWith(QueryClause.FIND_BY)) {
      throw new Error(`Unsupported method ${methodName}`);
    }

    const core = this.extractCore(methodName);
    const select = this.extractSelect(methodName);
    const groupBy = this.extractGroupBy(methodName);
    // const orderBy = this.extractOrderBy(methodName);
    const where = this.buildWhere(core, values);
    const { orderBy, limit, offset } = this.extractOrderLimitOffset(
      methodName,
      values
    );

    return {
      action: "find",
      select: select,
      where,
      groupBy,
      orderBy,
      limit,
      offset,
    };
  }

  /**
   * @description
   * Extracts the core part of the method name after `findBy` and before any special clauses.
   *
   * @summary
   * Removes prefixes and detects delimiters (`Then`, `OrderBy`, `GroupBy`, `Limit`, `Offset`)
   * to isolate the main conditional part of the query.
   *
   * @param methodName {string} - The method name to parse.
   *
   * @return {string} The extracted core string used for building conditions.
   */
  private static extractCore(methodName: string): string {
    const afterFindBy = methodName.substring(QueryClause.FIND_BY.length);
    const regex = /(Then[A-Z]|OrderBy|GroupBy|Limit|Offset)/;
    const match = afterFindBy.match(regex);
    return match ? afterFindBy.substring(0, match.index) : afterFindBy;
  }

  static getFieldsFromMethodName(methodName: string): Array<string> {
    const core = this.extractCore(methodName);
    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    const conditions = parts.split(/And|Or/);
    return conditions.map((token) => {
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
    const groupByIndex = methodName.indexOf(QueryClause.GROUP_BY);
    if (groupByIndex === -1) return undefined;

    const after = methodName.substring(
      groupByIndex + QueryClause.GROUP_BY.length
    );
    const groupByPart = after.split(QueryClause.ORDER_BY)[0];
    return groupByPart
      .split(QueryClause.THEN_BY)
      .map(lowerFirst)
      .filter(Boolean);
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
   *
   * @param core {string} - The extracted core string from the method name.
   * @param values {any[]} - The values corresponding to the conditions.
   *
   * @return {Condition<any>} A structured condition object representing the query's where clause.
   */
  private static buildWhere(
    core: string,
    values: any[]
  ): Condition<any> | undefined {
    if (!core && values.length === 0) return undefined;

    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    const conditions = parts.split(/And|Or/);

    const operators = core.match(/And|Or/g) || [];

    let where: Condition<any> | undefined;

    conditions.forEach((token, idx) => {
      const { field, operator } = this.parseFieldAndOperator(token);
      const parser = operator ? OperatorsMap[operator] : OperatorsMap.Equals;
      if (!parser) throw new Error(`Unsupported operator ${operator}`);

      const conditionValue = values[idx];
      if (typeof conditionValue === "undefined") {
        throw new Error(`Invalid value for field ${field}`);
      }

      const condition = parser(field, conditionValue);
      where =
        idx === 0
          ? condition
          : operators[idx - 1] === QueryClause.AND
            ? where!.and(condition)
            : where!.or(condition);
    });

    if (conditions.length === 0) return undefined;

    if (!where) throw new Error("No conditions found in method name");
    return where;
  }

  /**
   * @description
   * Parses a field name and operator from a string token.
   *
   * @summary
   * Identifies the operator suffix (if present) and returns a descriptor containing the field
   * name in lowercase-first format along with the operator.
   *
   * @param str {string} - The token string to parse.
   *
   * @return {FilterDescriptor} An object containing the field name and operator.
   */
  private static parseFieldAndOperator(str: string): FilterDescriptor {
    for (const operator of Object.keys(OperatorsMap)) {
      if (str.endsWith(operator)) {
        const field = str.slice(0, -operator.length);
        return { field: lowerFirst(field), operator };
      }
    }
    return { field: lowerFirst(str) };
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
   * Determines the number of condition arguments, then checks the remaining arguments
   * to resolve sorting, limiting, and pagination.
   *
   * @param methodName {string} - The extracted core string from the method name.
   * @param values {any[]} - The values corresponding to method arguments, including conditions and extras.
   *
   * @return {OrderLimitOffsetExtract} An object containing orderBy, limit, and offset values if present.
   */
  private static extractOrderLimitOffset(
    methodName: string,
    values: any[]
  ): OrderLimitOffsetExtract {
    const core = this.extractCore(methodName);
    const conditionCount = core.split(/And|Or/).length;
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
}
