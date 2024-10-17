import { SelectorBasedClause } from "./SelectorBasedClause";
import {
  CountOption,
  DistinctOption,
  MaxOption,
  MinOption,
  SelectOption,
  WhereOption,
} from "../options";
import { Const, Priority, StatementType } from "../constants";
import { Constructor, ModelArg } from "@decaf-ts/decorator-validation";
import { SelectSelector } from "../selectors";
import { DBModel } from "@decaf-ts/db-decorators";

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
export abstract class SelectClause<Q, M extends DBModel>
  extends SelectorBasedClause<Q, SelectSelector>
  implements SelectOption<M>
{
  private isDistinct: boolean = false;
  private isCount = false;
  private isMax = false;
  private isMin = false;

  protected constructor(clause?: ModelArg<SelectClause<Q, M>>) {
    super(Object.assign({}, clause, { priority: Priority.SELECT }));
    if (this.selector === Const.FULL_RECORD) this.statement.setFullRecord();
    this.statement.setMode(StatementType.QUERY);
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
  /**
   * @inheritDoc
   */
  distinct(selector: SelectSelector): DistinctOption<M> {
    this.isDistinct = true;
    this.selector = selector;
    return this;
  }
  /**
   * @inheritDoc
   */
  count(selector: SelectSelector): CountOption<M> {
    this.selector = selector;
    return this;
  }
  /**
   * @inheritDoc
   */
  min(selector: SelectSelector): MinOption<M> {
    this.selector = selector;
    return this;
  }
  /**
   * @inheritDoc
   */
  max(selector: SelectSelector): MaxOption<M> {
    this.selector = selector;
    return this;
  }
  /**
   * @inheritDoc
   */
  from(tableName: Constructor<M>): WhereOption {
    return this.Clauses.from(this.statement, tableName);
  }
}
