/**
 * @description Interface for executable operations
 * @summary Defines a contract for objects that can execute an operation and return a result
 * @template R - The type of result returned by the execute method
 * @interface Executor
 * @memberOf module:core
 */
export interface Executor<R> {
  /**
   * @description Executes the operation
   * @summary Performs the operation and returns a promise that resolves to the result
   * @return {Promise<R>} A promise that resolves to the result of type R
   */
  execute(): Promise<R>;
}
