import { SelectorBasedClause } from "./SelectorBasedClause";
import { Priority } from "../constants";
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import { LimitOption, OffsetOption } from "../options";
import { ClauseExecutor } from "../../interfaces";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
/**
 * @summary The ORDER BY clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class OrderByClause
 * @extends SelectorBasedClause
 * @implements LimitOption
 * @implements OffsetOption
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class OrderByClause<Q, M extends Model, R>
  extends SelectorBasedClause<Q, OrderBySelector<M>[], M, R>
  implements LimitOption<R>, OffsetOption<R>
{
  protected constructor(clause?: ModelArg<OrderByClause<Q, M, R>>) {
    super(Object.assign({}, clause, { priority: Priority.ORDER_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  groupBy(selector: GroupBySelector<M>): ClauseExecutor<R> {
    return this.Clauses.groupBy(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  limit(selector: LimitSelector): OffsetOption<R> {
    return this.Clauses.limit(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): ClauseExecutor<R> {
    return this.Clauses.offset(this.statement, selector);
  }
}
