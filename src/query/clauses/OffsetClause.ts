import { SelectorBasedClause } from "./SelectorBasedClause";
import { OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { ModelArg } from "@decaf-ts/decorator-validation";

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
export abstract class OffsetClause<Q> extends SelectorBasedClause<
  Q,
  OffsetSelector
> {
  protected constructor(clause?: ModelArg<OffsetClause<Q>>) {
    super(Object.assign({}, clause, { priority: Priority.GROUP_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
}
