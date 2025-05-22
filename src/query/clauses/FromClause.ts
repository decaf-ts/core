import { Priority } from "../constants";
import {
  FromSelector,
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import {
  LimitOption,
  OffsetOption,
  OrderAndGroupOption,
  WhereOption,
} from "../options";
import { SelectorBasedClause } from "./SelectorBasedClause";
import { ClauseExecutor } from "../../interfaces";
import { QueryError } from "../errors";
import { Condition } from "../Condition";
import {
  Constructor,
  Model,
  ModelArg,
  stringFormat,
} from "@decaf-ts/decorator-validation";

/**
 * @summary The FROM clause
 *
 * @param {ModelArg} [clause]
 *
 * @class FromClause
 * @extends SelectorBasedClause
 * @implements WhereOption
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class FromClause<Q, M extends Model, R>
  extends SelectorBasedClause<Q, FromSelector<M>, M, R>
  implements WhereOption<M, R>
{
  protected constructor(clause?: ModelArg<FromClause<Q, M, R>>) {
    super(Object.assign({}, clause, { priority: Priority.FROM }));
    this.selector =
      typeof this.selector === "string"
        ? Model.get(this.selector)
        : this.selector;
    if (!this.selector)
      throw new QueryError(stringFormat("Could not find selector model: {0}"));
    this.statement.setTarget(this.selector as Constructor<M>);
  }

  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;

  /**
   * @inheritDoc
   */
  where(condition: Condition<M>): OrderAndGroupOption<M, R> {
    return this.Clauses.where(this.statement, condition);
  }
  /**
   * @inheritDoc
   */
  orderBy(...selector: OrderBySelector<M>[]): LimitOption<R> & OffsetOption<R> {
    return this.Clauses.orderBy(this.statement, selector);
  }
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
