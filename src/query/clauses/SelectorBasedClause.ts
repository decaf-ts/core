import { Clause } from "../Clause";
import { Model, ModelArg, required } from "@decaf-ts/decorator-validation";

/**
 * @summary The base Selector based clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class SelectorBasedClause
 * @extends Clause
 * @abstract
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class SelectorBasedClause<Q, S> extends Clause<Q> {
  /**
   * @summary Stores the selector
   *
   * @prop selector
   * @protected
   */
  @required()
  protected selector?: S = undefined;

  protected constructor(clause?: ModelArg<SelectorBasedClause<Q, S>>) {
    super(clause);
    this.selector = (clause as { selector: S }).selector;
  }

  toString() {
    return this.constructor.name + `[${this.selector}]`;
  }
}
