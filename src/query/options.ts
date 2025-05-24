/* eslint-disable @typescript-eslint/no-empty-object-type */
import {
  GroupBySelector,
  LimitSelector,
  OffsetSelector,
  OrderBySelector,
  SelectSelector,
} from "./selectors";
import { Executor } from "../interfaces";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Condition } from "./Condition";
import { Paginatable } from "../interfaces/Paginatable";

/**
 * @summary GroupBy Option interface
 * @description Exposes the GROUP BY method and remaining options
 *
 * @interface GroupByOption
 */
export interface GroupByOption<M extends Model, R> extends Executor<R> {
  groupBy(selector: GroupBySelector<M>): Executor<R>;
}
/**
 * @summary Offset Option interface
 * @description Exposes the OFFSET method and remaining options
 *
 * @interface GroupByOption
 */
export interface OffsetOption<R> extends Executor<R> {
  offset(selector: OffsetSelector): Executor<R>;
}
/**
 * @summary Limit Option interface
 * @description Exposes the LIMIT method and remaining options
 *
 * @interface LimitOption
 */
export interface LimitOption<M extends Model, R>
  extends Executor<R>,
    Paginatable<M, R, any> {
  limit(selector: LimitSelector): OffsetOption<R>;
}
/**
 * @summary OrderBy Option interface
 * @description Exposes the ORDER BY method and remaining options
 *
 * @interface OrderByOption
 */
export interface OrderByOption<M extends Model, R>
  extends Executor<R>,
    Paginatable<M, R, any> {
  orderBy(selector: OrderBySelector<M>): LimitOption<M, R> & OffsetOption<R>;
}
/**
 * @summary OrderBy Option interface
 * @description Exposes the ORDER BY method and remaining options
 *
 * @interface ThenByOption
 */
export interface ThenByOption<M extends Model, R>
  extends LimitOption<M, R>,
    OffsetOption<R>,
    Executor<R>,
    Paginatable<M, R, any> {
  thenBy(selector: OrderBySelector<M>): ThenByOption<M, R>;
}
/**
 * @summary Groups several order and grouping options
 *
 * @interface OrderAndGroupOption
 * @extends OrderByOption
 * @extends GroupByOption
 * @extends LimitOption
 * @extends OffsetOption
 */
export interface OrderAndGroupOption<M extends Model, R>
  extends OrderByOption<M, R>,
    Executor<R>,
    GroupByOption<M, R>,
    LimitOption<M, R>,
    OffsetOption<R> {}
/**
 * @summary Where Option interface
 * @description Exposes the WHERE method and remaining options
 *
 * @interface WhereOption
 * @extends OrderAndGroupOption
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
 */
export interface DistinctOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Max Option Interface
 * @description Exposes the remaining options after a MAX
 *
 * @interface MaxOption
 * @extends FromOption
 */
export interface MaxOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Min Option Interface
 * @description Exposes the remaining options after a MIN
 *
 * @interface MinOption
 * @extends FromOption
 */
export interface MinOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Count Option Interface
 * @description Exposes the remaining options after a COUNT
 *
 * @interface CountOption
 * @extends FromOption
 */
export interface CountOption<M extends Model, R> extends FromOption<M, R> {}

/**
 * @summary Select Option Interface
 * @description Exposes the remaining options after a SELECT
 *
 * @interface SelectOption
 * @extends FromOption
 */
export interface SelectOption<M extends Model, R> extends FromOption<M, R> {
  distinct<const S extends SelectSelector<M>>(
    selector: S
  ): DistinctOption<M, M[S][]>;

  max<const S extends SelectSelector<M>>(selector: S): MaxOption<M, M[S]>;

  min<const S extends SelectSelector<M>>(selector: S): MinOption<M, M[S]>;

  count<const S extends SelectSelector<M>>(
    selector?: S
  ): CountOption<M, number>;
}

/**
 * @summary Into Option Interface
 * @description Exposes the remaining options after an INTO
 *
 * @interface IntoOption
 */
export interface IntoOption<M extends Model, R> {
  values(...models: M[]): Executor<R>;

  where(condition: Condition<M>): Executor<R>;
}
/**
 * @summary Valuest Option Interface
 * @description Exposes the remaining options after a VALUES
 *
 * @interface ValuesOption
 */
export interface ValuesOption<M extends Model> extends Executor<M> {}
/**
 * @summary Insert Option Interface
 * @description Exposes the remaining options after an INSERT
 *
 * @interface InsertOption
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
 */
export interface ConditionBuilderOption<M extends Model> {
  attribute(attr: keyof M): AttributeOption<M>;
}
