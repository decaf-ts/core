import { Observer } from "./Observer";

/**
 * @description Interface for objects that can be observed
 * @summary Defines a contract for objects that implement the Observer pattern, allowing them to register observers,
 * remove observers, and notify all registered observers of state changes
 * @interface Observable
 * @memberOf module:core
 */
export interface Observable {
  /**
   * @description Registers an observer to receive notifications
   * @summary Adds an observer to the list of observers that will be notified of state changes
   * @param {Observer} observer - The observer to register
   * @param {...any[]} args - Additional arguments to pass to the observer
   * @return {void}
   */
  observe(observer: Observer, ...args: any[]): void;

  /**
   * @description Unregisters an observer from receiving notifications
   * @summary Removes an observer from the list of observers that will be notified of state changes
   * @param {Observer} observer - The observer to unregister
   * @param {...any[]} args - Additional arguments to help identify the observer
   * @return {void}
   */
  unObserve(observer: Observer, ...args: any[]): void;

  /**
   * @description Notifies all registered observers of a state change
   * @summary Calls the update method on all registered observers, passing any provided arguments
   * @param {...any[]} args - Arguments to pass to the observers' update methods
   * @return {Promise<void>} A promise that resolves when all observers have been updated
   */
  updateObservers(...args: any[]): Promise<void>;
}
