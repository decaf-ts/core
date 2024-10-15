import {
  constructFromObject,
  Model,
  ModelArg,
  ModelErrorDefinition,
  ModelErrors,
} from "@decaf-ts/decorator-validation";
import { GroupBySelector } from "../selectors";
import { Priority } from "../constants";
import { Statement } from "../Statement";
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
    super(clause);
    Model.fromObject<GroupByClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.GROUP_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
}
