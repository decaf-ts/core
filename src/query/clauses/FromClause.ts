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
import { Executor } from "../../interfaces";
import { QueryError } from "../errors";
import { Condition } from "../Condition";
import {
  Constructor,
  Model,
  ModelArg,
  stringFormat,
} from "@decaf-ts/decorator-validation";
import { DBModel } from "@decaf-ts/db-decorators";

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
export abstract class FromClause<Q, M extends DBModel>
  extends SelectorBasedClause<Q, FromSelector<M>>
  implements WhereOption
{
  protected constructor(clause?: ModelArg<FromClause<Q, M>>) {
    super(clause);
    Model.fromObject<FromClause<Q, M>>(
      this,
      Object.assign({}, clause, { priority: Priority.FROM }),
    );

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
  where(condition: Condition): OrderAndGroupOption {
    return this.Clauses.where(this.statement, condition);
  }
  /**
   * @inheritDoc
   */
  orderBy(...selector: OrderBySelector[]): LimitOption & OffsetOption {
    return this.Clauses.orderBy(this.statement, selector);
  }
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
