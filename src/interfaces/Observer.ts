/**
 * @description Interface for objects that observe state changes
 * @summary Defines a contract for objects that implement the Observer pattern, allowing them to be notified of changes in Observable objects
 * @interface Observer
 * @memberOf module:core
 */
export interface Observer {
  /**
   * @description Updates the observer with new state information
   * @summary Called by an Observable when its state changes, allowing the Observer to react to those changes
   * @param {...any[]} args - Arguments containing state information from the Observable
   * @return {Promise<void>} A promise that resolves when the observer has processed the update
   */
  refresh(...args: any[]): Promise<void>;
}
