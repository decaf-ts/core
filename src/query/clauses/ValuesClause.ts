import { Clause } from "../Clause";
import { Priority } from "../constants";
import { Statement } from "../Statement";
import {
  Model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";

/**
 * @summary The VALUES clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class ValuesClause
 * @extends Clause
 *
 * @category Query
 * @subcategory Clauses
 */
export class ValuesClause<Q, M> extends Clause<Q> {
  @required()
  @type(Array.name)
  models?: M[] = undefined;

  protected constructor(clause?: ModelArg<ValuesClause<Q, M>>) {
    super(clause);
    Model.fromObject<ValuesClause<Q, M>>(
      this,
      Object.assign({}, clause, { priority: Priority.FROM }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    return query;
  }
  /**
   * @summary Factory method for {@link ValuesClause}
   * @param {Statement} statement
   * @param {T[]} values
   */
  static from<Q, M>(statement: Statement<Q>, values: M[]): ValuesClause<Q, M> {
    return new ValuesClause<Q, M>({ statement: statement, models: values });
  }
}
