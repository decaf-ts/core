import { QueryClause } from "./types";

/**
 * @description Comparison operators for query conditions
 * @summary Enum defining the available operators for comparing values in database queries
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum Operator {
  /** Equal comparison (=) */
  EQUAL = "EQUAL",
  /** Not equal comparison (!=) */
  DIFFERENT = "DIFFERENT",
  /** Greater than comparison (>) */
  BIGGER = "BIGGER",
  /** Greater than or equal comparison (>=) */
  BIGGER_EQ = "BIGGER_EQ",
  /** Less than comparison (<) */
  SMALLER = "SMALLER",
  /** Less than or equal comparison (<=) */
  SMALLER_EQ = "SMALLER_EQ",
  // BETWEEN = "BETWEEN",
  /** Negation operator (NOT) */
  NOT = "NOT",
  /** Inclusion operator (IN) */
  IN = "IN",
  // IS = "IS",
  /** Regular expression matching */
  REGEXP = "REGEXP",
  GROUP_BY = "group-by",
  COUNT = "count",
  SUM = "sum",
  MAX = "v_max",
  MIN = "v_min",
  DISTINCT = "distinct",
  VIEW = "view",
}

/**
 * @description Logical operators for combining query conditions
 * @summary Enum defining the available operators for grouping multiple conditions in database queries
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum GroupOperator {
  /** Logical AND operator - all conditions must be true */
  AND = "AND",
  /** Logical OR operator - at least one condition must be true */
  OR = "OR",
}

export enum PreparedStatementKeys {
  LIST_BY = "listBy",
  FIND_BY = QueryClause.FIND_BY,
  FIND_ONE_BY = "findOneBy",
  PAGE_BY = "paginateBy",
}
