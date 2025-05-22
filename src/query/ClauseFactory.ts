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
import { QueryResult } from "./types";

export abstract class ClauseFactory<Y, Q, A extends Adapter<Y, Q, any, any>> {
  /**
   * @summary Factory method for {@link FromClause}
   * @param {Statement} statement
   * @param {FromSelector} selector
   */
  abstract from<M extends Model, R>(
    statement: Statement<Q, M, R>,
    selector: FromSelector<M>
  ): FromClause<Q, M, R>;
  /**
   * @summary Factory method for {@link GroupByClause}
   * @param {Statement} statement
   * @param {GroupBySelector} selector
   */
  abstract groupBy<M extends Model, R>(
    statement: Statement<Q, M, R>,
    selector: GroupBySelector<M>
  ): GroupByClause<Q, M, R>;
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
  abstract limit<M extends Model, R>(
    statement: Statement<Q, M, R>,
    selector: LimitSelector
  ): LimitClause<Q, M, R>;
  /**
   * @summary Factory method for {@link OffsetClause}
   * @param {Statement} statement
   * @param {OffsetSelector} selector
   */
  abstract offset<M extends Model, R>(
    statement: Statement<Q, M, R>,
    selector: OffsetSelector
  ): OffsetClause<Q, M, R>;
  /**
   * @summary Factory method for {@link OrderByClause}
   * @param {Statement} statement
   * @param {OrderBySelector} selector
   */
  abstract orderBy<M extends Model, R>(
    statement: Statement<Q, M, R>,
    selector: OrderBySelector<M>[]
  ): OrderByClause<Q, M, R>;
  /**
   * @summary Factory method for {@link SelectClause}
   * @param {Statement} statement
   * @param {SelectSelector} [selector]
   */
  abstract select<M extends Model, S extends SelectSelector<M>[]>(
    selector?: S
  ): SelectClause<Q, M, QueryResult<M, S>>;
  /**
   * @summary Factory method for {@link ValuesClause}
   * @param {Statement} statement
   * @param {M[]} values
   */
  abstract values<M extends Model, R>(
    statement: Statement<Q, M, R>,
    values: M[]
  ): ValuesClause<Q, M>;
  /**
   * @summary Factory method for {@link WhereClause}
   * @param {Statement} statement
   * @param {Condition} condition
   */
  abstract where<M extends Model, R>(
    statement: Statement<Q, M, R>,
    condition: Condition<M>
  ): WhereClause<Q, M, R>;

  protected constructor(protected adapter: A) {}
}
