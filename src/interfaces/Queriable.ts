import { Condition, SelectSelector, WhereOption } from "../query";
import { OrderDirection } from "../repository";
import { Model } from "@decaf-ts/decorator-validation";

/**
 * @description Interface for objects that support querying
 * @summary Defines a contract for objects that can be queried with various conditions, selections, and ordering
 * @template M - The model type, must extend Model
 * @interface Queriable
 * @memberOf module:core
 */
export interface Queriable<M extends Model> {
  /**
   * @description Selects all properties from the model
   * @summary Creates a query that will return all properties of the model
   * @template S - The selector type extending an array of SelectSelector<M>
   * @return {WhereOption} A WhereOption object for further query configuration
   */
  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<M>[],
  >(): WhereOption<M, M[]>;

  /**
   * @description Selects specific properties from the model
   * @summary Creates a query that will return only the specified properties of the model
   * @template S - The selector type extending an array of SelectSelector<M>
   * @param selector - Array of property names to select
   * @return A WhereOption object for further query configuration
   */
  select<S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): WhereOption<M, Pick<M, S[number]>[]>;

  /**
   * @description Selects properties from the model
   * @summary Creates a query that will return either all properties or only the specified properties of the model
   * @template S - The selector type extending an array of SelectSelector<M>
   * @param [selector] - Optional array of property names to select
   * @return A WhereOption object for further query configuration
   */
  select<S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): WhereOption<M, M[]> | WhereOption<M, Pick<M, S[number]>[]>;

  /**
   * @description Executes a query with the specified conditions and options
   * @summary Retrieves model instances that match the given condition, ordered and limited as specified
   * @template M - The model type, must extend Model
   * @param {Condition<M>} condition - The condition to filter results
   * @param {string} orderBy - The property to order results by
   * @param {OrderDirection} order - The direction to order results (ascending or descending)
   * @param {number} [limit] - Optional maximum number of results to return
   * @param {number} [skip] - Optional number of results to skip
   * @return {Promise<M[]>} A promise that resolves to an array of model instances
   */
  query(
    condition: Condition<M>,
    orderBy: keyof M,
    order: OrderDirection,
    limit?: number,
    skip?: number
  ): Promise<M[]>;
}
