import { OrderDirection } from "../repository";
import { Constructor, Model } from "@decaf-ts/decorator-validation";

/**
 * @typedef FromSelector
 *
 * @category Clauses
 */
export type FromSelector<M extends Model> = Constructor<M> | string;
/**
 * @typedef GroupBySelector
 *
 * @category Clauses
 */
export type GroupBySelector<M extends Model> = keyof M;
/**
 * @typedef OrderBySelector
 *
 * @category Clauses
 */
export type OrderBySelector<M extends Model> = [keyof M, OrderDirection];
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

/**
 * @typedef SelectSelector
 *
 * @category Clauses
 */
export type SelectSelector<M extends Model> = keyof M;
