/**
 * @summary Executes a raw instruction in the Database
 * @typeDef Q The input type
 * @typeDef R The result type
 *
 * @interface RawExecutor
 * @category Query
 */
export interface RawExecutor<Q> {
  /**
   * @summary Executes a raw instruction in the Database
   *
   * @typeDef V the expected outcome of the instruction
   * @param rawInput
   * @param args
   *
   * @method
   */
  raw<R>(rawInput: Q, ...args: any[]): Promise<R>;
}
