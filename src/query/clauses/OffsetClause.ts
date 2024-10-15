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
export abstract class OffsetClause<Q> extends SelectorBasedClause<
  Q,
  OffsetSelector
> {
  protected constructor(clause?: ModelArg<OffsetClause<Q>>) {
    super(clause);
    Model.fromObject<OffsetClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.GROUP_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q; // {
  // const skip: number = parseInt(this.selector as string);
  // if (isNaN(skip)) throw new QueryError("Failed to parse offset");
  // query.skip = skip;
  // return query;
  // }
}
