import { SelectorBasedClause } from "./SelectorBasedClause";
import { Priority } from "../constants";
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import { LimitOption, OffsetOption } from "../options";
import { Executor } from "../../interfaces";
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
export abstract class OrderByClause<Q>
  extends SelectorBasedClause<Q, OrderBySelector[]>
  implements LimitOption, OffsetOption
{
  protected constructor(clause?: ModelArg<OrderByClause<Q>>) {
    super(Object.assign({}, clause, { priority: Priority.ORDER_BY }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  groupBy(selector: GroupBySelector): Executor {
    return this.Clauses.groupBy(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  limit(selector: LimitSelector): OffsetOption {
    return this.Clauses.limit(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): Executor {
    return this.Clauses.offset(this.statement, selector);
  }
}
