import { ModelArg } from "@decaf-ts/decorator-validation";
import { GroupBySelector } from "../selectors";
import { Priority } from "../constants";
import { SelectorBasedClause } from "./SelectorBasedClause";

/**
 * @summary The GROUP BY clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class GroupByClause
 * @extends SelectorBasedClause
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class GroupByClause<Q> extends SelectorBasedClause<
  Q,
  GroupBySelector
> {
  protected constructor(clause?: ModelArg<GroupByClause<Q>>) {
    super(Object.assign({}, clause, { priority: Priority.GROUP_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
}
