export enum Operator {
  EQUAL = "$eq",
  DIFFERENT = "$ne",
  BIGGER = "$gt",
  BIGGER_EQ = "$gte",
  SMALLER = "$lt",
  SMALLER_EQ = "$lte",
  // BETWEEN = "BETWEEN",
  NOT = "$not",
  IN = "$in",
  // IS = "IS",
  REGEXP = "$regex",
}

export enum GroupOperator {
  AND = "$and",
  OR = "$or",
}

export enum Const {
  NULL = "null",
}

/**
 * @summary Defines execution order of Clauses in statements as defined in SQL.
 *
 * @description sub priorities where defined to better organize clauses within statements, eg From and Join Clauses
 *
 * @const Priority
 *
 * @category Clauses
 * @subcategory Constants
 */
export enum Priority {
  /**
   * @summary Defines the priority for the FROM Clause
   * @description From Clause in SELECT Statements.
   * Values Clause in INSERT Statements
   *
   * @prop FROM
   */
  FROM = 1,
  /**
   * @summary Defines the priority for the JOIN Clause
   *
   * @property {number} JOIN
   */
  JOIN = 1.1,
  /**
   * Where Clause
   */
  WHERE = 2,
  /**
   * Group By Clause
   */
  GROUP_BY = 3,
  /**
   * Having Clause
   */
  HAVING = 4,
  /**
   * Select Clause in SELECT Statements
   * Insert Clause in INSERT Statements
   */
  SELECT = 5,
  /**
   * Order By Clause
   */
  ORDER_BY = 6,
  /**
   * Limit Clause
   */
  LIMIT = 7,
  /**
   * Offset Clause
   */
  OFFSET = 7.1,
}

export const MandatoryPriorities = [Priority.FROM, Priority.SELECT];

export enum StatementType {
  QUERY = "query",
  TRANSACTION = "transaction",
}
