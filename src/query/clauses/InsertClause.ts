import { Condition } from "../Condition";
import { InsertOption, IntoOption, OrderAndGroupOption } from "../options";
import { Priority } from "../constants";
import { Clause } from "../Clause";
import {
  Constructor,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { Executor } from "../../interfaces";

/**
 * @summary The INSERT/INTO clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class FromClause
 * @extends Clause
 * @implements IntoOption
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class InsertClause<Q, M extends Model>
  extends Clause<Q>
  implements InsertOption<M>, IntoOption<M>
{
  @required()
  protected table?: string = undefined;

  protected constructor(clause?: ModelArg<InsertClause<Q, M>>) {
    super(Object.assign({}, clause, { priority: Priority.SELECT }));
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;

  /**
   * @inheritDoc
   */
  into(table: Constructor<M>): IntoOption<M> {
    this.table = table.name; // TODO get mapped name
    this.statement.setTarget(table);
    return this;
  }
  /**
   * @inheritDoc
   */
  values(...models: M[]): Executor {
    return this.Clauses.values(this.statement, models);
  }
  /**
   * @inheritDoc
   */
  where(condition: Condition<M>): OrderAndGroupOption<M> {
    return this.Clauses.where(this.statement, condition);
  }
}
