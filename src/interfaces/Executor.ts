/**
 * @summary processes query objects
 *
 * @interface Executor
 *
 * @category Query
 */
export interface Executor {
  /**
   * @summary Processes itself
   *
   * @param {any[]} args
   *
   * @method
   */
  execute<V>(...args: any): Promise<V[]>;
}
