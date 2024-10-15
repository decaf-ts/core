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
export abstract class ValuesClause<Q, M> extends Clause<Q> {
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
  abstract build(query: Q): Q;
}
