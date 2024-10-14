import {
  constructFromObject,
  Model,
  ModelArg,
  ModelErrorDefinition,
  ModelErrors,
} from "@decaf-ts/decorator-validation";
import { GroupBySelector } from "../selectors";
import { Priority } from "../constants";
import { Statement } from "../Statement";
import { SelectorBasedClause } from "./SelectorBasedClause";

/**
 * @summary The GROUP BY clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class GroupByClause
 * @extends SelectorBasedClause
 *
 * @category Query
 * @subcategory Clauses
 */
export class GroupByClause<Q> extends SelectorBasedClause<Q, GroupBySelector> {
  constructor(clause?: ModelArg<GroupByClause<Q>>) {
    super(clause);
    Model.fromObject<GroupByClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.GROUP_BY }),
    );
  }
  /**
   * @inheritDoc
   */
  build(query: Q): Q {
    return query;
  }

  hasErrors(...exceptions: any[]): ModelErrorDefinition | undefined {
    return new ModelErrorDefinition({
      groupBy: "GroupBy is not implemented",
    } as unknown as ModelErrors);
  }

  /**
   * @summary Factory method for {@link GroupByClause}
   * @param {Statement} statement
   * @param {GroupBySelector} selector
   */
  static from<Q>(
    statement: Statement<Q>,
    selector: GroupBySelector,
  ): GroupByClause<Q> {
    return new GroupByClause({ selector: selector, statement: statement });
  }
}
