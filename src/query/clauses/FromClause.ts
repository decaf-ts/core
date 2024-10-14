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
import { Statement } from "../Statement";
import {
  Constructor,
  Model,
  ModelArg,
  stringFormat,
} from "@decaf-ts/decorator-validation";
import { LimitClause } from "./LimitClause";
import { OffsetClause } from "./OffsetClause";
import { OrderByClause } from "./OrderByClause";
import { GroupByClause } from "./GroupByClause";
import { WhereClause } from "./WhereClause";
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
export class FromClause<Q, M extends DBModel>
  extends SelectorBasedClause<Q, FromSelector>
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
  build(query: Q): Q {
    // const selectors: any = {};
    // selectors[ReservedAttributes.TABLE] = {};
    // selectors[ReservedAttributes.TABLE][Operator.EQUAL] =
    //   typeof this.selector === "string"
    //     ? this.selector
    //     : (this.selector!.name as string);
    // query.selector = selectors;
    // return query;
    return undefined as Q;
  }

  /**
   * @inheritDoc
   */
  where(condition: Condition): OrderAndGroupOption {
    return WhereClause.from(this.statement, condition);
  }
  /**
   * @inheritDoc
   */
  orderBy(...selector: OrderBySelector[]): LimitOption & OffsetOption {
    return OrderByClause.from(this.statement, selector);
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
   * @summary Factory method for {@link FromClause}
   * @param {Statement} statement
   * @param {FromSelector} selector
   */
  static from<Q, M extends DBModel>(
    statement: Statement<Q>,
    selector: FromSelector,
  ): FromClause<Q, M> {
    return new FromClause({ selector: selector, statement: statement });
  }
}
