/**
 * @summary processes query objects
 *
 * @typedef V the output
 *
 * @interface Executor
 *
 * @category Query
 */
export interface Executor<R> {
  /**
   * @summary Processes itself
   *
   * @param {any[]} args
   *
   * @method
   */
  execute(...args: any[]): Promise<R>;
}
