import { Observer } from "./Observer";

export interface Observable {
  observe(observer: Observer): void;

  unObserve(observer: Observer): void;
  /**
   * @summary have registered {@link Observer}s update themselves
   * @param {any[]} args
   * @method
   */
  updateObservers(...args: any[]): Promise<void>;
}
