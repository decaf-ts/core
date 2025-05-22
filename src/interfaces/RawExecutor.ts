/**
 * @summary Executes a raw instruction in the Database
 * @template Q The input type
 *
 * @interface RawExecutor
 */
export interface RawExecutor<Q> {
  raw<R>(rawInput: Q): Promise<R>;
}
