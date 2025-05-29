/**
 * @description Interface for executing raw queries
 * @summary Defines a contract for objects that can execute raw queries of a specific type and return results
 * @template Q - The query type that this executor can process
 * @interface RawExecutor
 * @memberOf module:core
 */
export interface RawExecutor<Q> {
  /**
   * @description Executes a raw query
   * @summary Processes a raw query input and returns a promise that resolves to the result
   * @template R - The result type that will be returned
   * @param {Q} rawInput - The raw query to execute
   * @return {Promise<R>} A promise that resolves to the result of type R
   */
  raw<R>(rawInput: Q): Promise<R>;
}
