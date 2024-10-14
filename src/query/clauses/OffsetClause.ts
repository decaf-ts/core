import { SelectorBasedClause } from "./SelectorBasedClause";
import { GroupBySelector, OffsetSelector } from "../selectors";
import { Priority } from "../constants";
import { Statement } from "../Statement";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";

/**
 * @summary The OFFSET clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class FromClause
 * @extends SelectorBasedClause
 *
 * @category Query
 * @subcategory Clauses
 */
export class OffsetClause<Q> extends SelectorBasedClause<Q, GroupBySelector> {
  constructor(clause?: ModelArg<OffsetClause<Q>>) {
    super(clause);
    Model.fromObject<OffsetClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.GROUP_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    // const skip: number = parseInt(this.selector as string);
    // if (isNaN(skip)) throw new QueryError("Failed to parse offset");
    // query.skip = skip;
    return query;
  }
  /**
   * @summary Factory method for {@link OffsetClause}
   * @param {Statement} statement
   * @param {OffsetSelector} selector
   */
  static from<Q>(
    statement: Statement<Q>,
    selector: OffsetSelector,
  ): OffsetClause<Q> {
    return new OffsetClause({ selector: selector, statement: statement });
  }
}
