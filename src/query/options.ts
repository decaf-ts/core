/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
  SelectSelector,
} from "./selectors";
import { ClauseExecutor } from "../interfaces";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Condition } from "./Condition";
import { Paginatable } from "../interfaces/Paginatable";
import { DistinctQueryResult, ReducedResult } from "./types";

/**
 * @summary Statement Builder interface
 * @description Exposes the final method to build the statement
 *
 * @typedef Q The query object type to build
 * @interface QueryBuilder
 *
 * @category Query
 * @subcategory Options
 *
 */
export interface QueryBuilder<Q, R> extends ClauseExecutor<R> {
  /**
   * Method to build and validate the prepared statement before the execution;
   *
   * @throws {QueryError}  for invalid statements
   * @method
   */
  build(previous: Q): Q;
}

/**
 * @summary GroupBy Option interface
 * @description Exposes the GROUP BY method and remaining options
 *
 * @interface GroupByOption
 * @extends QueryBuilder
 *
 * @category Query
 * @subcategory Options
 */
export interface GroupByOption<M extends Model, R> extends ClauseExecutor<R> {
  /**
   * @summary Groups records by an attribute
   *
   * @param {GroupBySelector} selector
   * @method
   */
  groupBy(selector: GroupBySelector<M>): ClauseExecutor<R>;
}
/**
 * @summary Offset Option interface
 * @description Exposes the OFFSET method and remaining options
 *
 * @interface GroupByOption
 * @extends QueryBuilder
 *
 * @category Query
 * @subcategory Options
 */
export interface OffsetOption<R> extends ClauseExecutor<R> {
  /**
   * @summary Offsets the results by the provided selector
   *
   * @param {OffsetSelector} selector
   * @method
   */
  offset(selector: OffsetSelector): ClauseExecutor<R>;
}
/**
 * @summary Limit Option interface
 * @description Exposes the LIMIT method and remaining options
 *
 * @interface LimitOption
 * @extends QueryBuilder
 *
 * @category Query
 * @subcategory Options
 */
export interface LimitOption<R> extends ClauseExecutor<R>, Paginatable<R> {
  /**
   * @summary Limits the results to the provided number
   *
   * @param {LimitSelector} selector
   * @method
   */
  limit(selector: LimitSelector): OffsetOption<R>;
}
/**
 * @summary OrderpBy Option interface
 * @description Exposes the ORDER BY method and remaining options
 *
 * @interface OrderByOption
 * @extends QueryBuilder
 *
 * @category Query
 * @subcategory Options
 */
export interface OrderByOption<M extends Model, R>
  extends ClauseExecutor<R>,
    Paginatable<R> {
  /**
   * @summary Orders the results by the provided attribute and according to the provided direction
   *
   * @param {OrderBySelector} selector
   * @method
   */
  orderBy(...selector: OrderBySelector<M>[]): LimitOption<R> & OffsetOption<R>;
}
/**
 * @summary Groups several order and grouping options
 *
 * @interface OrderAndGroupOption
 * @extends OrderByOption
 * @extends GroupByOption
 * @extends LimitOption
 * @extends OffsetOption
 *
 * @category Query
 * @subcategory Options
 */
export interface OrderAndGroupOption<M extends Model, R>
  extends OrderByOption<M, R>,
    GroupByOption<M, R>,
    LimitOption<R>,
    OffsetOption<R> {}
/**
 * @summary Where Option interface
 * @description Exposes the WHERE method and remaining options
 *
 * @interface WhereOption
 * @extends OrderAndGroupOption
 *
 * @category Query
 * @subcategory Options
 */
export interface WhereOption<M extends Model, R>
  extends OrderAndGroupOption<M, R> {
  /**
   * @summary filter the records by a condition
   *
   * @param {Condition} condition
   * @method
   */
  where(condition: Condition<M>): OrderAndGroupOption<M, R>;
}

/**
 * @summary From Option Interface
 * @description Exposes the FROM method and remaining options
 *
 * @interface FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface FromOption<M extends Model, R> {
  /**
   * @summary selects records from a table
   *
   * @param {Constructor} tableName
   * @method
   */
  from(tableName: Constructor<M> | string): WhereOption<M, R>;
}

/**
 * @summary Distinct Option Interface
 * @description Exposes the remaining options after a DISTINCT
 *
 * @interface DistinctOption
 * @extends FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface DistinctOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Max Option Interface
 * @description Exposes the remaining options after a MAX
 *
 * @interface MaxOption
 * @extends FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface MaxOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Min Option Interface
 * @description Exposes the remaining options after a MIN
 *
 * @interface MinOption
 * @extends FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface MinOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Count Option Interface
 * @description Exposes the remaining options after a COUNT
 *
 * @interface CountOption
 * @extends FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface CountOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Select Option Interface
 * @description Exposes the remaining options after a SELECT
 *
 * @interface SelectOption
 * @extends FromOption
 *
 * @category Query
 * @subcategory Options
 */
export interface SelectOption<M extends Model, R> extends FromOption<M, R> {
  /**
   * @summary selects distinct values
   *
   * @param {SelectSelector} selector
   * @method
   */
  distinct<R extends SelectSelector<M>>(
    selector: R
  ): DistinctOption<M, DistinctQueryResult<M, R>>;
  /**
   * @summary the maximum value
   *
   * @param {SelectSelector} selector
   * @method
   */
  max<R extends SelectSelector<M>>(
    selector: R
  ): MaxOption<M, ReducedResult<M, R>>;
  /**
   * @summary selects the minimum value
   *
   * @param {SelectSelector} selector
   * @method
   */
  min<R extends SelectSelector<M>>(
    selector: R
  ): MinOption<M, ReducedResult<M, R>>;
  /**
   * @summary counts the records
   *
   * @param {SelectSelector} selector
   * @method
   */
  count(selector?: SelectSelector<M>): CountOption<M, number>;
}

/**
 * @summary Into Option Interface
 * @description Exposes the remaining options after an INTO
 *
 * @interface IntoOption
 *
 * @category Query
 * @subcategory Options
 */
export interface IntoOption<M extends Model, R> {
  /**
   * @summary sets the models to insert
   *
   * @param {M[]} models
   * @method
   */
  values(...models: M[]): ClauseExecutor<R>;
  /**
   * @summary filter records to insert
   *
   * @param {Condition} condition
   * @method
   */
  where(condition: Condition<M>): ClauseExecutor<R>;
}
/**
 * @summary Valuest Option Interface
 * @description Exposes the remaining options after a VALUES
 *
 * @interface ValuesOption
 * @extends QueryBuilder
 *
 * @category Query
 * @subcategory Options
 */
export interface ValuesOption<M extends Model> extends ClauseExecutor<M> {}
/**
 * @summary Insert Option Interface
 * @description Exposes the remaining options after an INSERT
 *
 * @interface InsertOption
 *
 * @category Query
 * @subcategory Options
 */
export interface InsertOption<M extends Model, R = void> {
  /**
   * @summary selects the table to insert records into
   *
   * @param {string | Constructor} table
   * @method
   */
  into(table: Constructor<M>): IntoOption<M, R>;
}

/**
 * @summary {@link Operator} Option Interface
 * @description Exposes the available operators for a {@link Condition}
 *
 * @interface AttributeOption
 *
 * @category Query
 * @subcategory Conditions
 */
export interface AttributeOption<M extends Model> {
  /**
   * @summary Test equality
   *
   * @param {any} val the value to test
   * @method
   */
  eq(val: any): Condition<M>;
  /**
   * @summary Test difference
   *
   * @param {any} val the value to test
   * @method
   */
  dif(val: any): Condition<M>;
  /**
   * @summary Test greater than
   *
   * @param {any} val the value to test
   * @method
   */
  gt(val: any): Condition<M>;
  /**
   * @summary Test lower than
   *
   * @param {any} val the value to test
   * @method
   */
  lt(val: any): Condition<M>;
  /**
   * @summary Test greater or equal to
   *
   * @param {any} val the value to test
   * @method
   */
  gte(val: any): Condition<M>;
  /**
   * @summary Test lower or equal to
   *
   * @param {any} val the value to test
   * @method
   */
  lte(val: any): Condition<M>;
  /**
   * @summary Test value in a range of values
   * @param {any[]} val
   */
  in(val: any[]): Condition<M>;
  /**
   * @summary Test matches {@link RegExp}
   *
   * @param {any} val the value to test
   * @method
   */
  regexp(val: string | RegExp): Condition<M>;
}
/**
 * @summary The starting point for creating Conditions
 * @description Exposes the available operations for a {@link Condition}
 *
 * @interface ConditionBuilderOption
 *
 * @category Query
 * @subcategory Conditions
 */
export interface ConditionBuilderOption<M extends Model> {
  attribute(attr: keyof M): AttributeOption<M>;
}
