import { Condition } from "./Condition";
import { OperatorParser } from "./types";

/**
 * @description
 * Map of supported operators to their corresponding parser functions.
 *
 * @summary
 * The `OperatorsMap` defines a collection of operator names as keys
 * (such as `Equals`, `LessThan`, `Between`, etc.), each mapped to a
 * function that constructs a `Condition` object for that operator.
 * These functions translate query clauses into concrete condition
 * builders, enabling dynamic query construction from method names.
 *
 * @template T The type of the field values used in conditions.
 *
 * @param f {string} - The field name the condition applies to.
 * @param v1 {any} - The value to compare the field against or the lower bound value for range-based operators.
 * @param v2 {any} - The upper bound value for range-based operators.
 *
 * @return {Condition<any>} A condition object representing the operator applied to the field.
 *
 * @function OperatorsMap
 *
 * @mermaid
 * sequenceDiagram
 *   participant Client as Caller
 *   participant Map as OperatorsMap
 *   participant Parser as OperatorParser
 *   participant Cond as Condition
 *
 *   Client->>Map: Request operator parser ("Between", field, v1, v2)
 *   Map->>Parser: Call corresponding operator function
 *   Parser->>Cond: Condition.attribute(field)
 *   Cond-->>Parser: Condition instance
 *   Parser->>Cond: Apply between(v1, v2)
 *   Parser-->>Client: Return built Condition
 *
 * @memberOf module:query
 */
export const OperatorsMap: Record<string, OperatorParser> = {
  Equals: (f, v) => Condition.attribute(f as any).eq(v),
  Diff: (f, v) => Condition.attribute(f as any).dif(v),
  LessThan: (f, v) => Condition.attribute(f as any).lt(v),
  LessThanEqual: (f, v) => Condition.attribute(f as any).lte(v),
  GreaterThan: (f, v) => Condition.attribute(f as any).gt(v),
  GreaterThanEqual: (f, v) => Condition.attribute(f as any).gte(v),
  Between: (f, v1, v2) => Condition.attribute(f as any).between(v1, v2),
  In: (f, v) => Condition.attribute(f as any).in(v),
  Matches: (f, v) => Condition.attribute(f as any).regexp(v),
};

/**
 * @description
 * Number of method arguments each operator consumes from the query value list.
 *
 * @summary
 * Most operators consume a single value, but range-style operators such as
 * `Between` consume two (`min` and `max`). The map is consulted by the
 * method-name parser so arity is resolved from operator metadata rather than
 * hardcoded per operator at each call site.
 *
 * @memberOf module:query
 */
export const OperatorsArityMap: Record<string, number> = {
  Between: 2,
};

/**
 * @description
 * Resolves how many values an operator consumes.
 *
 * @summary
 * Returns the declared arity for the given operator, defaulting to `1` for
 * single-value operators (and for an absent operator, which falls back to `Equals`).
 *
 * @param operator {string} - The operator name (e.g. `Between`).
 *
 * @return {number} The number of values the operator consumes.
 *
 * @function getOperatorArity
 * @memberOf module:query
 */
export function getOperatorArity(operator?: string): number {
  if (!operator) return 1;
  return OperatorsArityMap[operator] ?? 1;
}
