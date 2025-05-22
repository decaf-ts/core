import { SelectorBasedClause } from "./SelectorBasedClause";
import { OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";

/**
 * @summary The OFFSET clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class FromClause
 * @extends SelectorBasedClause
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class OffsetClause<
  Q,
  M extends Model,
  R,
> extends SelectorBasedClause<Q, OffsetSelector, M, R> {
  protected constructor(clause?: ModelArg<OffsetClause<Q, M, R>>) {
    super(Object.assign({}, clause, { priority: Priority.GROUP_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
}
