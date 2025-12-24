import { Condition, GroupOperator, Operator, QueryError } from "../query";
import { RamContext, RawRamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { Statement } from "../query/Statement";
import { Metadata } from "@decaf-ts/decoration";
import { Adapter, AdapterFlags } from "../persistence/index";
import { OrderDirection } from "../repository/constants";

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
    return (el1: Model, el2: Model) => {
      if (!this.orderBySelector)
        throw new InternalError(
          "orderBySelector not set. Should be impossible"
        );
      const selector = this.orderBySelector;
      const [key, direction] = selector;
      const normalizedDirection = String(direction).toLowerCase();
      const directionFactor =
        normalizedDirection === OrderDirection.ASC ? 1 : -1;
      const value1 = el1[key as keyof Model];
      const value2 = el2[key as keyof Model];

      if (value1 === value2) return 0;

      if (value1 == null || value2 == null)
        return directionFactor * (value1 == null ? 1 : -1);

      const { designType: type } = Metadata.getPropDesignTypes(
        el1.constructor as any,
        key
      );
      const resolvedType =
        (type && type.name && type.name.toLowerCase()) || typeof value1;

      switch (resolvedType) {
        case "string":
          return (
            directionFactor *
            this.compareStrings(value1 as string, value2 as string)
          );
        case "number":
          return (
            directionFactor *
            this.compareNumbers(value1 as number, value2 as number)
          );
        case "bigint":
          return (
            directionFactor *
            this.compareBigInts(value1 as unknown as bigint, value2 as unknown as bigint)
          );
        case "boolean":
          return (
            directionFactor *
            this.compareBooleans(value1 as boolean, value2 as boolean)
          );
        case "date":
        case "object":
          if (
            value1 instanceof Date &&
            value2 instanceof Date
          ) {
            return (
              directionFactor *
              this.compareDates(value1 as Date, value2 as Date)
            );
          }
          break;
        default:
          break;
      }

      throw new QueryError(
        `sorting not supported for type ${resolvedType}`
      );
    };
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
    };
    if (this.orderBySelector) result.sort = this.getSort();
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
}
