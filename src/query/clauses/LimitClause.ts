import { SelectorBasedClause } from "./SelectorBasedClause";
import { OffsetOption } from "../options";
import { Executor } from "../../interfaces";
import { LimitSelector, OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { ModelArg } from "@decaf-ts/decorator-validation";

/**
 * @summary Limit Clause
 * @description Limits the results
 *
 * @param {ClauseArg} [clause]
 *
 * @class LimitClause
 * @extends SelectorBasedClause<T>
 * @implements OffsetOption<T>
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class LimitClause<Q>
  extends SelectorBasedClause<Q, LimitSelector>
  implements OffsetOption
{
  protected constructor(clause?: ModelArg<LimitClause<Q>>) {
    super(Object.assign({}, clause, { priority: Priority.GROUP_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): Executor {
    return this.Clauses.offset(this.statement, selector);
  }
}
