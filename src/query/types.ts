import { Condition } from "./Condition";
import { OrderBySelector } from "./selectors";

/**
 * @description
 * Options for configuring query building behavior.
 *
 * @summary
 * The `QueryOptions` type defines flags that determine whether certain clauses
 * (limit, offset, order by) are permitted, as well as whether violations
 * should throw an error during query construction.
 *
 * @memberOf module:query
 */
export type QueryOptions = {
  allowLimit?: boolean;
  allowOffset?: boolean;
  allowOrderBy?: boolean;
  throws?: boolean;
};

/**
 * @description
 * Structured query object representing parsed query clauses.
 *
 * @summary
 * The `QueryAssist` interface defines the standard structure returned
 * by query builders. It includes actions such as find, optional clauses
 * like select, groupBy, and orderBy, and pagination controls (limit, offset).
 *
 * @template T The entity or record type that conditions may apply to.
 *
 * @interface QueryAssist
 * @memberOf module:query
 */
export interface QueryAssist {
  action: "find";
  select: undefined | string[];
  where?: Condition<any>;
  groupBy?: string[];
  orderBy?: OrderBySelector<any>[];
  limit: number | undefined;
  offset: number | undefined;
}

/**
 * @description
 * Enumeration of supported query clauses for building method-based queries.
 *
 * @summary
 * The `QueryClause` enum defines string literals that represent
 * different segments of a query (e.g., `findBy`, `Select`, `And`, `Or`).
 *
 * @enum QueryClause
 * @memberOf module:query
 */
export enum QueryClause {
  FIND_BY = "findBy",
  SELECT = "Select",
  AND = "And",
  OR = "Or",
  GROUP_BY = "GroupBy",
  ORDER_BY = "OrderBy",
  THEN = "Then",
  THEN_BY = "ThenBy",
}

/**
 * @description
 * Function signature for parsing operators in query building.
 *
 * @summary
 * The `OperatorParser` type represents a function that takes a field name
 * and arguments, then produces a `Condition` object that can be used in a query.
 *
 * @template T The type of the condition result.
 *
 * @param field {string} - The name of the field being parsed.
 * @param args {any[]} - Additional arguments for operator evaluation.
 *
 * @return {Condition<any>} A condition object representing the parsed operator.
 *
 * @memberOf module:query
 */
export type OperatorParser = (field: string, ...args: any) => Condition<any>;

/**
 * @description
 * Descriptor for fields and their associated operators in query parsing.
 *
 * @summary
 * The `FilterDescriptor` interface defines the structure used when parsing
 * method segments into filterable fields and associated operators.
 *
 * @interface FilterDescriptor
 * @memberOf module:query
 */
export interface FilterDescriptor {
  field: string;
  operator?: string;
}
