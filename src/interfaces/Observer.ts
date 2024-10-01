/**
 * @summary Observer Api
 * @description will be called by the {@link Observable}
 *
 * @interface Observer
 *
 * @category Observables
 */
export interface Observer {
  /**
   * @summary Refreshes the Observer
   * @param {any[]} args
   * @method
   */
  refresh(...args: any[]): Promise<void>;
}
