import { OrderDirection } from "../repository";
import { Constructor } from "@decaf-ts/decorator-validation";
import { DBModel } from "@decaf-ts/db-decorators";

/**
 * @typedef FromSelector
 *
 * @category Clauses
 */
export type FromSelector<M extends DBModel> = Constructor<M> | string;
/**
 * @typedef GroupBySelector
 *
 * @category Clauses
 */
export type GroupBySelector = string;
/**
 * @typedef OrderBySelector
 *
 * @category Clauses
 */
export type OrderBySelector = [string, OrderDirection];
/**
 * @typedef LimitSelector
 *
 * @category Clauses
 */
export type LimitSelector = number;
/**
 * @typedef OffsetSelector
 *
 * @category Clauses
 */
export type OffsetSelector = number;

// export type SelectFunction<T = any> = (obj: T) => T | any;
/**
 * @typedef SelectSelector
 *
 * @category Clauses
 */
export type SelectSelector = string | string[];
