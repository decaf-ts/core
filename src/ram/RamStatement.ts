import { Condition, GroupOperator, Operator, QueryError } from "../query";
import { SelectSelector } from "../query/selectors";
import { RamContext, RawRamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { Statement } from "../query/Statement";
import { Adapter } from "../persistence/Adapter";
import { AdapterFlags } from "../persistence/types";
import { OrderDirection } from "../repository/constants";
import { Constructor, Metadata } from "@decaf-ts/decoration";

/**
 * @description RAM-specific query statement builder
 * @summary Extends the base Statement class to provide query building functionality for the RAM adapter.
 * This class translates high-level query operations into predicates that can filter and sort
 * in-memory data structures.
 * @template M - The model type being queried
 * @template R - The result type returned by the query
 * @param {RamAdapter} adapter - The RAM adapter instance to use for executing queries
 * @class RamStatement
 * @category Ram
 * @example
 * ```typescript
 * // Create a statement for querying User models
 * const statement = new RamStatement<User, User>(ramAdapter);
 *
 * // Build a query to find active users with age > 18
 * const results = await statement
 *   .from(User)
 *   .where(Condition.and(
 *     Condition.eq('active', true),
 *     Condition.gt('age', 18)
 *   ))
 *   .orderBy('lastName', 'asc')
 *   .limit(10)
 *   .execute();
 * ```
 */
export class RamStatement<
  M extends Model,
  R,
  A extends Adapter<M, any, RawRamQuery<any>, RamContext>,
> extends Statement<M, A, R, RawRamQuery<any>> {
  constructor(adapter: A, overrides?: Partial<AdapterFlags>) {
    super(adapter, overrides);
  }

  /**
   * @description Creates a sort comparator function
   * @summary Generates a function that compares two model instances based on the orderBy criteria.
   * This method handles different data types (string, number, date) and sort directions (asc, desc).
   * @return {function(Model, Model): number} A comparator function for sorting model instances
   */
  private getSort() {
    const selectors = this.orderBySelectors;
    return (el1: Model, el2: Model) => {
      if (!selectors || !selectors.length)
        throw new InternalError(
          "orderBySelectors not set. Should be impossible"
        );
      for (const [key, direction] of selectors) {
        const normalizedDirection = String(direction).toLowerCase();
        const directionFactor =
          normalizedDirection === OrderDirection.ASC ? 1 : -1;
        const comparison = this.compareByKey(el1, el2, key as keyof Model);
        if (comparison !== 0) return directionFactor * comparison;
      }
      return 0;
    };
  }

  private compareByKey(el1: Model, el2: Model, key: keyof Model): number {
    const value1 = el1[key];
    const value2 = el2[key];

    if (value1 === value2) return 0;

    if (value1 == null || value2 == null) return value1 == null ? 1 : -1;

    const { designType: type } = Metadata.getPropDesignTypes(
      el1.constructor as any,
      key as string
    );
    const resolvedType =
      (type && type.name && type.name.toLowerCase()) || typeof value1;

    switch (resolvedType) {
      case "string":
        return this.compareStrings(
          value1 as unknown as string,
          value2 as unknown as string
        );
      case "number":
        return this.compareNumbers(
          value1 as unknown as number,
          value2 as unknown as number
        );
      case "bigint":
        return this.compareBigInts(
          value1 as unknown as bigint,
          value2 as unknown as bigint
        );
      case "boolean":
        return this.compareBooleans(
          value1 as unknown as boolean,
          value2 as unknown as boolean
        );
      case "date":
      case "object":
        if (value1 instanceof Date && value2 instanceof Date) {
          return this.compareDates(value1 as Date, value2 as Date);
        }
        break;
      default:
        break;
    }

    throw new QueryError(`sorting not supported for type ${resolvedType}`);
  }

  private compareBooleans(a: boolean, b: boolean): number {
    return a === b ? 0 : a ? 1 : -1;
  }

  private compareNumbers(a: number, b: number): number {
    return a - b;
  }

  private compareBigInts(a: bigint, b: bigint): number {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b);
  }

  private compareDates(a: Date, b: Date): number {
    return a.valueOf() - b.valueOf();
  }

  /**
   * @description Builds a RAM query from the statement
   * @summary Converts the statement's selectors and conditions into a RawRamQuery object
   * that can be executed by the RAM adapter. This method assembles all query components
   * (select, from, where, limit, offset, sort) into the final query structure.
   * @return {RawRamQuery<M>} The constructed RAM query object
   */
  protected build(): RawRamQuery<any> {
    if (this.minSelector)
      this.ensureNumberOrDateSelector(this.minSelector, "MIN operation");
    if (this.maxSelector)
      this.ensureNumberOrDateSelector(this.maxSelector, "MAX operation");
    if (this.sumSelector)
      this.ensureNumericSelector(this.sumSelector, "SUM operation");
    if (this.avgSelector)
      this.ensureNumberOrDateSelector(this.avgSelector, "AVG operation");

    const result: RawRamQuery<M> = {
      select: this.selectSelector,
      from: this.fromSelector,
      where: this.whereCondition
        ? this.parseCondition(this.whereCondition).where
        : // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (el: M) => {
            return true;
          },
      limit: this.limitSelector,
      skip: this.offsetSelector,
      groupBy: this.groupBySelectors,
    };

    if (typeof this.countSelector !== "undefined") result.count = this.countSelector;
    if (this.countDistinctSelector) result.countDistinct = this.countDistinctSelector;
    if (this.minSelector) result.min = this.minSelector;
    if (this.maxSelector) result.max = this.maxSelector;
    if (this.sumSelector) result.sum = this.sumSelector;
    if (this.avgSelector) result.avg = this.avgSelector;
    if (this.distinctSelector) result.distinct = this.distinctSelector;
    if (this.orderBySelectors?.length) result.sort = this.getSort();
    return result as RawRamQuery<any>;
  }

  /**
   * @description Parses a condition into a RAM query predicate
   * @summary Converts a Condition object into a predicate function that can be used
   * to filter model instances in memory. This method handles both simple conditions
   * (equals, greater than, etc.) and complex conditions with logical operators (AND, OR).
   * @template M - The model type for the condition
   * @param {Condition<M>} condition - The condition to parse
   * @return {RawRamQuery<M>} A RAM query object with a where predicate function
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamStatement
   *   participant SimpleCondition
   *   participant ComplexCondition
   *
   *   Caller->>RamStatement: parseCondition(condition)
   *   alt Simple condition (eq, gt, lt, etc.)
   *     RamStatement->>SimpleCondition: Extract attr1, operator, comparison
   *     SimpleCondition-->>RamStatement: Return predicate function
   *   else Logical operator (AND, OR)
   *     RamStatement->>ComplexCondition: Extract nested conditions
   *     RamStatement->>RamStatement: parseCondition(leftCondition)
   *     RamStatement->>RamStatement: parseCondition(rightCondition)
   *     ComplexCondition-->>RamStatement: Combine predicates with logical operator
   *   end
   *   RamStatement-->>Caller: Return query with where predicate
   */
  protected parseCondition(condition: Condition<M>): RawRamQuery<any> {
    return {
      where: (m: Model) => {
        const { attr1, operator, comparison } = condition as unknown as {
          attr1: string | Condition<M>;
          operator: Operator | GroupOperator;
          comparison: any;
        };

        if (
          [GroupOperator.AND, GroupOperator.OR, Operator.NOT].indexOf(
            operator as GroupOperator
          ) === -1
        ) {
          switch (operator) {
            case Operator.BIGGER:
              return m[attr1 as keyof Model] > comparison;
            case Operator.BIGGER_EQ:
              return m[attr1 as keyof Model] >= comparison;
            case Operator.DIFFERENT:
              return m[attr1 as keyof Model] !== comparison;
            case Operator.EQUAL:
              return m[attr1 as keyof Model] === comparison;
            case Operator.REGEXP:
              if (typeof m[attr1 as keyof Model] !== "string")
                throw new QueryError(
                  `Invalid regexp comparison on a non string attribute: ${m[attr1 as keyof Model]}`
                );
              return !!(m[attr1 as keyof Model] as unknown as string).match(
                new RegExp(comparison, "g")
              );
            case Operator.SMALLER:
              return m[attr1 as keyof Model] < comparison;
            case Operator.SMALLER_EQ:
              return m[attr1 as keyof Model] <= comparison;
            case Operator.IN:
              if (!Array.isArray(comparison))
                throw new QueryError(
                  `IN operator requires an array, got: ${typeof comparison}`
                );
              return comparison.includes(m[attr1 as keyof Model]);
            case Operator.BETWEEN: {
              if (!Array.isArray(comparison) || comparison.length !== 2)
                throw new QueryError(
                  `BETWEEN operator requires an array with 2 values [min, max], got: ${JSON.stringify(
                    comparison
                  )}`
                );
              const attr = attr1 as keyof Model;
              const attrName = attr as string;
              const attrType = this.determineAttributeType(
                m.constructor as Constructor<Model>,
                attrName,
                "BETWEEN"
              );
              if (!this.isNumericType(attrType) && attrType !== "date") {
                throw new QueryError(
                  `BETWEEN operator requires numeric or date attributes, but "${attrName}" is ${attrType ||
                    "unknown"}`
                );
              }
              const [min, max] = comparison;
              const value = m[attr];
              const comparableValue = this.toComparableValue(
                value,
                attrType,
                attrName,
                "BETWEEN",
                { allowNull: true }
              );
              if (comparableValue === null) return false;
              const minComparable = this.toComparableValue(
                min,
                attrType,
                attrName,
                "BETWEEN min"
              )!;
              const maxComparable = this.toComparableValue(
                max,
                attrType,
                attrName,
                "BETWEEN max"
              )!;
              return (
                comparableValue >= minComparable && comparableValue <= maxComparable
              );
            }
            default:
              throw new InternalError(
                `Invalid operator for standard comparisons: ${operator}`
              );
          }
        } else if (operator === Operator.NOT) {
          throw new InternalError("Not implemented");
        } else {
          const op1: RawRamQuery<any> = this.parseCondition(
            attr1 as Condition<M>
          );
          const op2: RawRamQuery<any> = this.parseCondition(
            comparison as Condition<M>
          );
          switch (operator) {
            case GroupOperator.AND:
              return op1.where(m) && op2.where(m);
            case GroupOperator.OR:
              return op1.where(m) || op2.where(m);
            default:
              throw new InternalError(
                `Invalid operator for And/Or comparisons: ${operator}`
              );
          }
        }
      },
    } as RawRamQuery<any>;
  }

  private ensureNumericSelector(
    selector: SelectSelector<M>,
    context: string
  ): void {
    this.ensureSelectorType(
      selector,
      context,
      (type) => this.isNumericType(type),
      "numeric"
    );
  }

  private ensureNumberOrDateSelector(
    selector: SelectSelector<M>,
    context: string
  ): void {
    this.ensureSelectorType(
      selector,
      context,
      (type) => this.isNumericType(type) || type === "date",
      "numeric or date"
    );
  }

  private ensureSelectorType(
    selector: SelectSelector<M>,
    context: string,
    predicate: (type: string) => boolean,
    description: string
  ) {
    if (!this.fromSelector) {
      throw new InternalError(
        `${context} requires a target model. Call from() before aggregating.`
      );
    }
    const attr = selector as string;
    const type = this.determineAttributeType(
      this.fromSelector,
      attr as keyof Model<false>,
      context
    );

    if (!predicate(type)) {
      throw new QueryError(
        `${context} requires a ${description} attribute, but "${attr}" is ${type || "unknown"}`
      );
    }
  }

  private determineAttributeType(
    clazz: Constructor<Model>,
    attr: string,
    context: string
  ): string {
    const propKey = attr as keyof Model<false>;
    const metaType =
      Metadata.type(clazz, propKey) ??
      Metadata.getPropDesignTypes(clazz, propKey)?.designType;
    const resolved = this.normalizeMetaType(metaType);
    if (!resolved) {
      throw new QueryError(
        `${context} could not resolve property type for "${attr}"`
      );
    }
    return resolved;
  }

  private normalizeMetaType(metaType: any): string | undefined {
    if (!metaType) return undefined;
    if (typeof metaType === "string") return metaType.toLowerCase();
    if (typeof metaType === "function" && metaType.name)
      return metaType.name.toLowerCase();
    return undefined;
  }

  private isNumericType(type?: string): boolean {
    return type === "number" || type === "bigint";
  }

  private toComparableValue(
    value: any,
    attrType: string,
    attrName: string,
    context: string,
    options?: { allowNull?: boolean }
  ): number | null {
    if (value == null) {
      if (options?.allowNull) return null;
      throw new QueryError(`${context} requires a value for "${attrName}"`);
    }
    switch (attrType) {
      case "date":
        if (!(value instanceof Date)) {
          throw new QueryError(
            `${context} on date attribute "${attrName}" requires Date values`
          );
        }
        return value.getTime();
      case "number":
        if (typeof value !== "number") {
          throw new QueryError(
            `${context} on numeric attribute "${attrName}" requires number values`
          );
        }
        return value;
      case "bigint":
        if (typeof value === "number") return value;
        if (typeof value === "bigint") return Number(value);
        throw new QueryError(
          `${context} on bigint attribute "${attrName}" requires numeric values`
        );
      default:
        throw new QueryError(
          `${context} unsupported type "${attrType}" for attribute "${attrName}"`
        );
    }
  }
}
