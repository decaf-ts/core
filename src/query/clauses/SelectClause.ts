import { SelectorBasedClause } from "./SelectorBasedClause";
import {
  CountOption,
  DistinctOption,
  MaxOption,
  MinOption,
  SelectOption,
  WhereOption,
} from "../options";
import { Priority, StatementType } from "../constants";
import { Constructor, ModelArg, Model } from "@decaf-ts/decorator-validation";
import { SelectSelector } from "../selectors";
import { DistinctQueryResult, ReducedResult } from "../types";

/**
 * @summary The SELECT clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class SelectClause
 * @extends SelectorBasedClause
 * @implements SelectOption
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class SelectClause<Q, M extends Model, R>
  extends SelectorBasedClause<Q, SelectSelector<M>[], M, R>
  implements SelectOption<M, R>
{
  private isDistinct: boolean = false;
  private isCount = false;
  private isMax = false;
  private isMin = false;

  protected constructor(clause?: ModelArg<SelectClause<Q, M, R>>) {
    super(Object.assign({}, clause, { priority: Priority.SELECT }));
    if (this.selector) this.statement.setSelectors(this.selector);
    this.statement.setMode(StatementType.QUERY);
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  distinct<R extends SelectSelector<M>>(
    selector: R
  ): DistinctOption<M, DistinctQueryResult<M, R>> {
    this.isDistinct = true;
    this.selector = [selector];
    return this as DistinctOption<M, DistinctQueryResult<M, R>>;
  }
  /**
   * @inheritDoc
   */
  count(selector: SelectSelector<M>): CountOption<M, number> {
    this.selector = [selector];
    return this as CountOption<M, number>;
  }
  /**
   * @inheritDoc
   */
  min<R extends SelectSelector<M>>(
    selector: R
  ): MinOption<M, ReducedResult<M, R>> {
    this.selector = [selector];
    return this as MinOption<M, ReducedResult<M, R>>;
  }
  /**
   * @inheritDoc
   */
  max<R extends SelectSelector<M>>(
    selector: R
  ): MaxOption<M, ReducedResult<M, R>> {
    this.selector = [selector];
    return this as MaxOption<M, ReducedResult<M, R>>;
  }
  /**
   * @inheritDoc
   */
  from(tableName: Constructor<M>): WhereOption<M, R> {
    return this.Clauses.from(this.statement, tableName);
  }
}
