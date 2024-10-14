import { SelectorBasedClause } from "./SelectorBasedClause";
import { OffsetOption } from "../options";
import { Executor } from "../../interfaces";
import { LimitSelector, OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { Statement } from "../Statement";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { OffsetClause } from "./OffsetClause";

/**
 * @summary Limit Clause
 * @description Limits the results
 *
 * @param {ClauseArg} [clause]
 *
 * @class LimitClause
 * @extends SelectorBasedClause<T>
 * @implements OffsetOption<T>
 *
 * @category Query
 * @subcategory Clauses
 */
export class LimitClause<Q>
  extends SelectorBasedClause<Q, LimitSelector>
  implements OffsetOption
{
  constructor(clause?: ModelArg<LimitClause<Q>>) {
    super(clause);
    Model.fromObject<LimitClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.GROUP_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    // query.limit = this.selector as number;
    return query;
  }
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): Executor {
    return OffsetClause.from(this.statement, selector);
  }
  /**
   * @summary Factory method for {@link LimitClause}
   * @param {Statement} statement
   * @param {LimitSelector} selector
   */
  static from<Q>(
    statement: Statement<Q>,
    selector: LimitSelector,
  ): LimitClause<Q> {
    return new LimitClause({ selector: selector, statement: statement });
  }
}
