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
    this.statement.setFullRecord(!!this.selector);
    this.statement.setMode(StatementType.QUERY);
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  distinct<const S extends SelectSelector<M>>(
    selector: S
  ): DistinctOption<M, M[S][]> {
    this.isDistinct = true;
    this.selector = [selector];
    return this as DistinctOption<M, M[S][]>;
  }
  /**
   * @inheritDoc
   */
  count<const S extends SelectSelector<M>>(
    selector?: S
  ): CountOption<M, number> {
    this.selector = selector ? [selector] : undefined;
    return this as CountOption<M, number>;
  }
  /**
   * @inheritDoc
   */
  min<const S extends SelectSelector<M>>(selector: S): MinOption<M, M[S]> {
    this.selector = [selector];
    return this as MinOption<M, M[S]>;
  }
  /**
   * @inheritDoc
   */
  max<const S extends SelectSelector<M>>(selector: S): MaxOption<M, M[S]> {
    this.selector = [selector];
    return this as MaxOption<M, M[S]>;
  }
  /**
   * @inheritDoc
   */
  from(tableName: Constructor<M>): WhereOption<M, R> {
    return this.Clauses.from(this.statement, tableName);
  }
}
