import {
  Condition,
  GroupOperator,
  Operator,
  Paginator,
  QueryError,
} from "../query";
import { RawRamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { RamPaginator } from "./RamPaginator";
import { InternalError } from "@decaf-ts/db-decorators";
import { Statement } from "../query/Statement";
import { Reflection } from "@decaf-ts/reflection";
import { RamAdapter } from "./RamAdapter";

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
export class RamStatement<M extends Model, R> extends Statement<
  RawRamQuery<M>,
  M,
  R
> {
  constructor(adapter: RamAdapter) {
    super(adapter as any);
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
      const type = Reflection.getTypeFromDecorator(el1, key as string);
      if (!type)
        throw new QueryError(`type not compatible with sorting: ${type}`);

      switch (type) {
        case "string":
        case "String":
          return (
            (direction === "asc" ? 1 : -1) *
            (el1[key as keyof Model] as unknown as string).localeCompare(
              el2[key as keyof Model] as unknown as string
            )
          );
        case "number":
        case "Number":
          return (
            (direction === "asc" ? 1 : -1) *
            ((el1[key as keyof Model] as unknown as number) -
              (el2[key as keyof Model] as unknown as number))
          );
        case "object":
        case "Object":
          if (
            el1[key as keyof Model] instanceof Date &&
            el2[key as keyof Model] instanceof Date
          )
            return (
              (direction === "asc" ? 1 : -1) *
              ((el1[key as keyof Model] as unknown as Date).valueOf() -
                (el2[key as keyof Model] as unknown as Date).valueOf())
            );
          throw new QueryError(`Sorting not supported for not date classes`);
        default:
          throw new QueryError(`sorting not supported for type ${type}`);
      }
    };
  }

  /**
   * @description Builds a RAM query from the statement
   * @summary Converts the statement's selectors and conditions into a RawRamQuery object
   * that can be executed by the RAM adapter. This method assembles all query components
   * (select, from, where, limit, offset, sort) into the final query structure.
   * @return {RawRamQuery<M>} The constructed RAM query object
   */
  protected build(): RawRamQuery<M> {
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
    return result;
  }

  /**
   * @description Creates a paginator for the query
   * @summary Builds the query and wraps it in a RamPaginator to enable pagination of results.
   * This allows retrieving large result sets in smaller chunks.
   * @param {number} size - The page size (number of results per page)
   * @return {Promise<Paginator<M, R, RawRamQuery<M>>>} A promise that resolves to a paginator for the query
   */
  async paginate(size: number): Promise<Paginator<M, R, RawRamQuery<M>>> {
    try {
      const query = this.build();
      return new RamPaginator<M, R>(
        this.adapter,
        query,
        size,
        this.fromSelector
      );
    } catch (e: any) {
      throw new InternalError(e);
    }
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
  parseCondition<M extends Model>(condition: Condition<M>): RawRamQuery<M> {
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
