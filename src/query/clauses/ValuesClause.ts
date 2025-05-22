import { Clause } from "../Clause";
import { Priority } from "../constants";
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
export abstract class ValuesClause<Q, M extends Model> extends Clause<
  Q,
  M,
  void
> {
  @required()
  @type(Array.name)
  models?: M[] = undefined;

  protected constructor(clause?: ModelArg<ValuesClause<Q, M>>) {
    super(Object.assign({}, clause, { priority: Priority.FROM }));
    this.models = clause?.models;
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
}
