import { Constructor } from "@decaf-ts/decoration";
import { OrderDirection } from "../repository";
import { Model } from "@decaf-ts/decorator-validation";

export type OrderDirectionInput =
  | OrderDirection
  | "asc"
  | "desc"
  | "ASC"
  | "DESC";

/**
 * @description Type for selecting the data source in a query
 * @summary Defines the type for specifying the table or model to query from
 * @template M - The model type this selector operates on
 * @typedef {Constructor<M> | string} FromSelector
 * @memberOf module:core
 */
export type FromSelector<M extends Model> = Constructor<M> | string;

export type GroupBySelector<M extends Model> = keyof M;

export type OrderBySelector<M extends Model> = [
  keyof M,
  OrderDirectionInput,
];

/**
 * @description Type for limiting query results
 * @summary Defines the type for specifying the maximum number of results to return
 * @typedef {number} LimitSelector
 * @memberOf module:core
 */
export type LimitSelector = number;

/**
 * @description Type for offsetting query results
 * @summary Defines the type for specifying the number of results to skip
 * @typedef {number} OffsetSelector
 * @memberOf module:core
 */
export type OffsetSelector = number;

/**
 * @description Type for selecting fields in a query
 * @summary Defines the type for specifying which fields to select from a model
 * @template M - The model type this selector operates on
 * @typedef SelectSelector
 * @memberOf module:core
 */
export type SelectSelector<M extends Model> = keyof M;
