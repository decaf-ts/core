import { Clause } from "../Clause";
import { Condition } from "../Condition";
import {
  ModelArg,
  ModelErrorDefinition,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { LimitOption, OffsetOption, OrderAndGroupOption } from "../options";
import { Priority } from "../constants";
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
} from "../selectors";
import { Executor } from "../../interfaces";
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
  @type("Condition")
  condition?: Condition = undefined;

  protected constructor(clause?: ModelArg<WhereClause<Q>>) {
    super(Object.assign({}, clause, { priority: Priority.WHERE }));
    this.condition = clause?.condition;
  }
  /**
   * @inheritDoc
   */
  abstract build(query: Q): Q;
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
