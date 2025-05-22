import { SelectorBasedClause } from "./SelectorBasedClause";
import { OffsetOption } from "../options";
import { ClauseExecutor } from "../../interfaces";
import { LimitSelector, OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";

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
export abstract class LimitClause<Q, M extends Model, R>
  extends SelectorBasedClause<Q, LimitSelector, M, R>
  implements OffsetOption<R>
{
  protected constructor(clause?: ModelArg<LimitClause<Q, M, R>>) {
    super(Object.assign({}, clause, { priority: Priority.GROUP_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): ClauseExecutor<R> {
    return this.Clauses.offset(this.statement, selector);
  }
}
