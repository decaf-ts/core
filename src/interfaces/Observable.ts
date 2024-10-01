import { Observer } from "./Observer";

/**
 * @summary Observable Api
 * @description manage and update {@link Observer}s
 *
 * @interface Observable
 *
 * @category Observables
 */
export interface Observable {
  /**
   * @summary Register new {@link Observer}s
   * @param {Observer} observer
   *
   * @method
   */
  observe(observer: Observer): void;
  /**
   * @summary Unregister new {@link Observer}s
   * @param {Observer} observer
   *
   * @method
   */
  unObserve(observer: Observer): void;
  /**
   * @summary have registered {@link Observer}s update themselves
   * @param {any[]} args
   * @method
   */
  updateObservers(...args: any[]): Promise<void>;
}
