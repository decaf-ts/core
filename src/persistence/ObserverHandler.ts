import { Observable, Observer } from "../interfaces";
import { EventIds, ObserverFilter } from "./types";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";

/**
 * @description Manages a collection of observers for database events
 * @summary The ObserverHandler class implements the Observable interface and provides a centralized
 * way to manage multiple observers. It allows registering observers with optional filters to control
 * which events they receive notifications for, and handles the process of notifying all relevant
 * observers when database events occur.
 * @class ObserverHandler
 * @example
 * ```typescript
 * // Create an observer handler
 * const handler = new ObserverHandler();
 * 
 * // Register an observer
 * const myObserver = {
 *   refresh: async (table, event, id) => {
 *     console.log(`Change in ${table}: ${event} for ID ${id}`);
 *   }
 * };
 * 
 * // Add observer with a filter for only user table events
 * handler.observe(myObserver, (table, event, id) => table === 'users');
 * 
 * // Notify observers about an event
 * await handler.updateObservers(logger, 'users', 'CREATE', 123);
 * 
 * // Remove an observer when no longer needed
 * handler.unObserve(myObserver);
 * ```
 */
export class ObserverHandler implements Observable {
  /**
   * @description Collection of registered observers
   * @summary Array of observer objects along with their optional filters
   */
  protected readonly observers: {
    observer: Observer;
    filter?: ObserverFilter;
  }[] = [];

  /**
   * @description Gets the number of registered observers
   * @summary Returns the count of observers currently registered with this handler
   * @return {number} The number of registered observers
   */
  count() {
    return this.observers.length;
  }

  /**
   * @description Registers a new observer
   * @summary Adds an observer to the collection with an optional filter function
   * @param {Observer} observer - The observer to register
   * @param {ObserverFilter} [filter] - Optional filter function to determine which events the observer receives
   * @return {void}
   */
  observe(observer: Observer, filter?: ObserverFilter): void {
    const index = this.observers.map((o) => o.observer).indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.observers.push({ observer: observer, filter: filter });
  }

  /**
   * @description Unregisters an observer
   * @summary Removes an observer from the collection
   * @param {Observer} observer - The observer to unregister
   * @return {void}
   */
  unObserve(observer: Observer): void {
    const index = this.observers.map((o) => o.observer).indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.observers.splice(index, 1);
  }

  /**
   * @description Notifies all relevant observers about a database event
   * @summary Filters observers based on their filter functions and calls refresh on each matching observer
   * @param {Logger} log - Logger for recording notification activities
   * @param {string} table - The name of the table where the event occurred
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of operation that occurred
   * @param {EventIds} id - The identifier(s) of the affected record(s)
   * @param {...any[]} args - Additional arguments to pass to the observers
   * @return {Promise<void>} A promise that resolves when all observers have been notified
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant ObserverHandler
   *   participant Observer
   *   
   *   Client->>ObserverHandler: updateObservers(log, table, event, id, ...args)
   *   
   *   ObserverHandler->>ObserverHandler: Filter observers
   *   
   *   loop For each observer with matching filter
   *     alt Observer has filter
   *       ObserverHandler->>Observer: Apply filter(table, event, id)
   *       alt Filter throws error
   *         ObserverHandler->>Logger: Log error
   *         ObserverHandler-->>ObserverHandler: Skip observer
   *       else Filter returns true
   *         ObserverHandler->>Observer: refresh(table, event, id, ...args)
   *       else Filter returns false
   *         ObserverHandler-->>ObserverHandler: Skip observer
   *       end
   *     else No filter
   *       ObserverHandler->>Observer: refresh(table, event, id, ...args)
   *     end
   *   end
   *   
   *   ObserverHandler->>ObserverHandler: Process results
   *   loop For each result
   *     alt Result is rejected
   *       ObserverHandler->>Logger: Log error
   *     end
   *   end
   *   
   *   ObserverHandler-->>Client: Return
   */
  async updateObservers(
    log: Logger,
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: any[]
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.observers
        .filter((o) => {
          const { filter } = o;
          if (!filter) return true;
          try {
            return filter(table, event, id);
          } catch (e: unknown) {
            log.error(
              `Failed to filter observer ${o.observer.toString()}: ${e}`
            );
            return false;
          }
        })
        .map((o) => o.observer.refresh(table, event, id, ...args))
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        log.error(
          `Failed to update observable ${this.observers[i].toString()}: ${result.reason}`
        );
    });
  }
}
