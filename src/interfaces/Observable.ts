import { Observer } from "./Observer";

export function unRegistration(observable: Observable, observer: Observer) {
  return () => observable.unObserve(observer);
}

/**
 * @description Interface for objects that can be observed
 * @summary Defines a contract for objects that implement the Observer pattern, allowing them to register observers,
 * remove observers, and notify all registered observers of state changes
 * @interface Observable
 * @memberOf module:core
 */
export interface Observable<
  REGISTRATION extends [Observer, ...any[]] = [Observer],
  ARGS extends any[] = any[],
> {
  /**
   * @description Registers an observer to receive notifications
   * @summary Adds an observer to the list of observers that will be notified of state changes
   * @template REGISTRATION - The type of the registration arguments for the observer
   * @param {...REGISTRATION} args - @{link Observer} and additional arguments
   * @return {void}
   */
  observe(...args: REGISTRATION): void;

  /**
   * @description Unregisters an observer from receiving notifications
   * @summary Removes an observer from the list of observers that will be notified of state changes
   * @template REGISTRATION - The type of the registration arguments for the observer
   * @param {...REGISTRATION} args - @{link Observer} and additional arguments
   * @return {void}
   */
  unObserve(...args: REGISTRATION): void;

  /**
   * @description Notifies all registered observers of a state change
   * @summary Calls the update method on all registered observers, passing any provided arguments
   * @param {...any[]} args - Arguments to pass to the observers' update methods
   * @return {Promise<void>} A promise that resolves when all observers have been updated
   */
  updateObservers(...args: ARGS): Promise<void>;
}
