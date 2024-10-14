import type { Statement } from "../Statement";
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
import { WhereClause } from "./WhereClause";
import { ValuesClause } from "./ValuesClause";
import { DBModel } from "@decaf-ts/db-decorators";

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
export class InsertClause<Q, M extends DBModel>
  extends Clause<Q>
  implements InsertOption<M>, IntoOption<M>
{
  @required()
  private table?: string = undefined;

  protected constructor(clause?: ModelArg<InsertClause<Q, M>>) {
    super(clause);
    Model.fromObject<InsertClause<Q, M>>(
      this,
      Object.assign({}, clause, { priority: Priority.SELECT }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    return query;
  }

  /**
   * @inheritDoc
   */
  into(table: Constructor<M>): IntoOption<M> {
    this.table = table.name;
    this.statement!.setTarget(table);
    return this;
  }
  /**
   * @inheritDoc
   */
  values(...models: M[]): Executor {
    return ValuesClause.from(this.statement as Statement<Q>, models);
  }
  /**
   * @inheritDoc
   */
  where(condition: Condition): OrderAndGroupOption {
    return WhereClause.from(this.statement as Statement<Q>, condition);
  }
  /**
   * @summary Factory method for {@link InsertClause}
   * @param {Statement} statement
   */
  static from<Q, M extends DBModel>(
    statement: Statement<Q>,
  ): InsertClause<Q, M> {
    return new InsertClause<Q, M>({ statement: statement });
  }
}
