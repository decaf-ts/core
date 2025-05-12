import { FromClause } from "./clauses";
import { GroupByClause } from "./clauses/GroupByClause";
import { InsertClause } from "./clauses/InsertClause";
import { LimitClause } from "./clauses/LimitClause";
import { OffsetClause } from "./clauses/OffsetClause";
import { OrderByClause } from "./clauses/OrderByClause";
import { SelectClause } from "./clauses/SelectClause";
import { ValuesClause } from "./clauses/ValuesClause";
import { WhereClause } from "./clauses/WhereClause";
import { Adapter } from "../persistence";
import { Condition } from "./Condition";
import {
  FromSelector,
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
  SelectSelector,
} from "./selectors";
import { Statement } from "./Statement";
import { Model } from "@decaf-ts/decorator-validation";

export abstract class ClauseFactory<Y, Q, A extends Adapter<Y, Q, any, any>> {
  /**
   * @summary Factory method for {@link FromClause}
   * @param {Statement} statement
   * @param {FromSelector} selector
   */
  abstract from<M extends Model>(
    statement: Statement<Q>,
    selector: FromSelector<M>
  ): FromClause<Q, M>;
  /**
   * @summary Factory method for {@link GroupByClause}
   * @param {Statement} statement
   * @param {GroupBySelector} selector
   */
  abstract groupBy(
    statement: Statement<Q>,
    selector: GroupBySelector
  ): GroupByClause<Q>;
  /**
   * @summary Factory method for {@link InsertClause}
   * @param {Statement} statement
   */
  abstract insert<M extends Model>(): InsertClause<Q, M>;
  /**
   * @summary Factory method for {@link LimitClause}
   * @param {Statement} statement
   * @param {LimitSelector} selector
   */
  abstract limit(
    statement: Statement<Q>,
    selector: LimitSelector
  ): LimitClause<Q>;
  /**
   * @summary Factory method for {@link OffsetClause}
   * @param {Statement} statement
   * @param {OffsetSelector} selector
   */
  abstract offset(
    statement: Statement<Q>,
    selector: OffsetSelector
  ): OffsetClause<Q>;
  /**
   * @summary Factory method for {@link OrderByClause}
   * @param {Statement} statement
   * @param {OrderBySelector} selector
   */
  abstract orderBy(
    statement: Statement<Q>,
    selector: OrderBySelector[]
  ): OrderByClause<Q>;
  /**
   * @summary Factory method for {@link SelectClause}
   * @param {Statement} statement
   * @param {SelectSelector} [selector]
   */
  abstract select<M extends Model>(
    selector?: SelectSelector
  ): SelectClause<Q, M>;
  /**
   * @summary Factory method for {@link ValuesClause}
   * @param {Statement} statement
   * @param {M[]} values
   */
  abstract values<M extends Model>(
    statement: Statement<Q>,
    values: M[]
  ): ValuesClause<Q, M>;
  /**
   * @summary Factory method for {@link WhereClause}
   * @param {Statement} statement
   * @param {Condition} condition
   */
  abstract where(statement: Statement<Q>, condition: Condition): WhereClause<Q>;

  protected constructor(protected adapter: A) {}
}
