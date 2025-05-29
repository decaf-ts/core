import { Paginator } from "../query/Paginator";
import { Model } from "@decaf-ts/decorator-validation";

/**
 * @description Interface for objects that support pagination
 * @summary Defines a contract for objects that can paginate their results, allowing for efficient data retrieval in chunks
 * @template M - The model type, must extend Model
 * @template R - The result type returned by the paginator
 * @template Q - The query type used for pagination
 * @interface Paginatable
 * @memberOf module:core
 */
export interface Paginatable<M extends Model, R, Q> {
  /**
   * @description Creates a paginator with the specified page size
   * @summary Initializes a paginator that can be used to retrieve data in pages of the specified size
   * @param {number} size - The number of items per page
   * @return {Promise<Paginator>} A promise that resolves to a paginator for the specified model, result, and query types
   */
  paginate(size: number): Promise<Paginator<M, R, Q>>;
}
