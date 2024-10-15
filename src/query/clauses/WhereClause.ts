import { Clause } from "../Clause";
import { Condition } from "../Condition";
import {
  constructFromObject,
  ModelArg,
  ModelErrorDefinition,
  required,
} from "@decaf-ts/decorator-validation";
import { LimitOption, OffsetOption, OrderAndGroupOption } from "../options";
import { Priority } from "../constants";
import { Statement } from "../Statement";
import { LimitClause } from "./LimitClause";
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import { OffsetClause } from "./OffsetClause";
import { OrderByClause } from "./OrderByClause";
import { Executor } from "../../interfaces";
import { GroupByClause } from "./GroupByClause";
/**
 * @summary The WHERE clause
 *
 * @param {ClauseArg} [clause]
 *
 * @class WhereClause
 * @extends Clause
 * @implements OrderAndGroupOption
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class WhereClause<Q>
  extends Clause<Q>
  implements OrderAndGroupOption
{
  @required()
  condition?: Condition = undefined;

  protected constructor(clause?: ModelArg<WhereClause<Q>>) {
    super(clause);
    constructFromObject<WhereClause<Q>>(
      this,
      Object.assign({}, clause, { priority: Priority.WHERE }),
    );
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q; // {
  // const condition = this.condition?.execute() as OperationResult;
  //
  // const selectorKeys = Object.keys(condition);
  // if (
  //   selectorKeys.length === 1 &&
  //   Object.values(GroupOperator).indexOf(selectorKeys[0] as GroupOperator) !==
  //     -1
  // )
  //   switch (selectorKeys[0]) {
  //     case GroupOperator.AND:
  //       condition[GroupOperator.AND] = [
  //         ...Object.values(condition[GroupOperator.AND]).reduce(
  //           (accum: any[], val: any) => {
  //             const keys = Object.keys(val);
  //             if (keys.length !== 1)
  //               throw new Error(
  //                 "Too many keys in query selector. should be one",
  //               );
  //             const k = keys[0];
  //             if (k === GroupOperator.AND) accum.push(...(val[k] as any[]));
  //             else accum.push(val);
  //             return accum;
  //           },
  //           [],
  //         ),
  //         ...Object.entries(query.selector).map(([key, val]) => {
  //           const result: Record<any, any> = {};
  //           result[key] = val;
  //           return result;
  //         }),
  //       ];
  //       query.selector = condition;
  //       break;
  //     case GroupOperator.OR:
  //       const s: Record<any, any> = {};
  //       s[GroupOperator.AND] = [
  //         condition,
  //         ...Object.entries(query.selector).map(([key, val]) => {
  //           const result: Record<any, any> = {};
  //           result[key] = val;
  //           return result;
  //         }),
  //       ];
  //       query.selector = s;
  //       break;
  //     default:
  //       throw new Error("This should be impossible");
  //   }
  // else {
  //   Object.entries(condition).forEach(([key, val]) => {
  //     if (query.selector[key])
  //       console.warn(
  //         stringFormat(
  //           "A {0} query param is about to be overridden: {1} by {2}",
  //           key,
  //           query.selector[key] as unknown as string,
  //           val as unknown as string,
  //         ),
  //       );
  //     query.selector[key] = val;
  //   });
  // }

  //   return query;
  // }
  /**
   * @inheritDoc
   */
  orderBy(...selector: OrderBySelector[]): LimitOption & OffsetOption {
    return this.Clauses.orderBy(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  groupBy(selector: GroupBySelector): Executor {
    return this.Clauses.groupBy(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  limit(selector: LimitSelector): OffsetOption {
    return this.Clauses.limit(this.statement, selector);
  }
  /**
   * @inheritDoc
   */
  offset(selector: OffsetSelector): Executor {
    return this.Clauses.offset(this.statement, selector);
  }

  /**
   * @inheritDoc
   */
  hasErrors(...exceptions: string[]): ModelErrorDefinition | undefined {
    const errors = super.hasErrors(...exceptions);
    if (errors) return errors;
    return this.condition!.hasErrors();
  }
}
