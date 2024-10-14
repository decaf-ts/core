import { SelectorBasedClause } from "./SelectorBasedClause";
import { Operator, Priority } from "../constants";
import { LimitClause } from "./LimitClause";
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import { LimitOption, OffsetOption } from "../options";
import { OffsetClause } from "./OffsetClause";
import { Executor } from "../../interfaces";
import { GroupByClause } from "./GroupByClause";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { Statement } from "../Statement";
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
export class OrderByClause<Q>
  extends SelectorBasedClause<Q, OrderBySelector[]>
  implements LimitOption, OffsetOption
{
  protected constructor(clause?: ModelArg<OrderByClause<Q>>) {
    super(clause);
    Model.fromObject<OrderByClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.ORDER_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    // query.sort = query.sort || [];
    // this.selector!.forEach((s) => {
    //   const [selector, value] = s;
    //   const rec: any = {};
    //   rec[selector] = value;
    //   (query.sort as any[]).push(rec as any);
    //   if (!query.selector[selector]) {
    //     query.selector[selector] = {};
    //     query.selector[selector][Operator.BIGGER] = null;
    //   }
    //   // query.fields = query.fields || [];
    //   // query.fields = [...new Set([...query.fields, selector]).keys()]
    // });
    return query;
  }
  /**
   * @inheritDoc
   */
  groupBy(selector: GroupBySelector): Executor {
    return GroupByClause.from(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  limit(selector: LimitSelector): OffsetOption {
    return LimitClause.from(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): Executor {
    return OffsetClause.from(this.statement, selector);
  }
  /**
   * @summary Factory method for {@link OrderByClause}
   * @param {Statement} statement
   * @param {OrderBySelector} selector
   */
  static from<Q>(
    statement: Statement<Q>,
    selector: OrderBySelector[],
  ): OrderByClause<Q> {
    return new OrderByClause({ selector: selector, statement: statement });
  }
}
