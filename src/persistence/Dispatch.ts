import {
  InternalError,
  OperationKeys,
  BulkCrudOperationKeys,
} from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Observable, Observer } from "../interfaces";
import { Adapter } from "./Adapter";
import { UnsupportedError } from "./errors";
import { Logger, Logging } from "@decaf-ts/logging";
import { EventIds } from "./types";

/**
 * @description Dispatches database operation events to observers
 * @summary The Dispatch class implements the Observable interface and is responsible for intercepting
 * database operations from an Adapter and notifying observers when changes occur. It uses proxies to
 * wrap the adapter's CRUD methods and automatically trigger observer updates after operations complete.
 * @template Y - The native database driver type
 * @param {void} - No constructor parameters
 * @class Dispatch
 * @example
 * ```typescript
 * // Creating and using a Dispatch instance
 * const dispatch = new Dispatch<PostgresDriver>();
 *
 * // Connect it to an adapter
 * const adapter = new PostgresAdapter(connection);
 * dispatch.observe(adapter);
 *
 * // Now any CRUD operations on the adapter will automatically
 * // trigger observer notifications
 * await adapter.create('users', 123, userModel);
 * // Observers will be notified about the creation
 *
 * // When done, you can disconnect
 * dispatch.unObserve(adapter);
 * ```
 */
export class Dispatch<Y> implements Observable {
  /**
   * @description The adapter being observed
   * @summary Reference to the database adapter whose operations are being monitored
   */
  protected adapter?: Adapter<Y, any, any, any>;

  /**
   * @description The native database driver
   * @summary Reference to the underlying database driver from the adapter
   */
  protected native?: Y;

  /**
   * @description List of model constructors
   * @summary Array of model constructors that are registered with the adapter
   */
  protected models!: ModelConstructor<any>[];

  /**
   * @description Logger instance
   * @summary Logger for recording dispatch activities
   */
  private logger!: Logger;

  /**
   * @description Accessor for the logger
   * @summary Gets or initializes the logger for this dispatch instance
   * @return {Logger} The logger instance
   */
  protected get log() {
    if (!this.logger)
      this.logger = Logging.for(this as any).for(this.adapter as any);
    return this.logger;
  }

  /**
   * @description Creates a new Dispatch instance
   * @summary Initializes a new Dispatch instance without any adapter
   */
  constructor() {}

  /**
   * @description Initializes the dispatch by proxying adapter methods
   * @summary Sets up proxies on the adapter's CRUD methods to intercept operations and notify observers.
   * This method is called automatically when an adapter is observed.
   * @return {Promise<void>} A promise that resolves when initialization is complete
   * @mermaid
   * sequenceDiagram
   *   participant Dispatch
   *   participant Adapter
   *   participant Proxy
   *
   *   Dispatch->>Dispatch: initialize()
   *   Dispatch->>Dispatch: Check if adapter exists
   *   alt No adapter
   *     Dispatch-->>Dispatch: Throw InternalError
   *   end
   *
   *   loop For each CRUD method
   *     Dispatch->>Adapter: Check if method exists
   *     alt Method doesn't exist
   *       Dispatch-->>Dispatch: Throw InternalError
   *     end
   *
   *     Dispatch->>Adapter: Get property descriptor
   *     loop While descriptor not found
   *       Dispatch->>Adapter: Check prototype chain
   *     end
   *
   *     alt Descriptor not found or not writable
   *       Dispatch->>Dispatch: Log error and continue
   *     else Descriptor found and writable
   *       Dispatch->>Proxy: Create proxy for method
   *       Dispatch->>Adapter: Replace method with proxy
   *     end
   *   end
   */
  protected async initialize(): Promise<void> {
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    const adapter = this.adapter as Adapter<Y, any, any, any>;
    (
      [
        OperationKeys.CREATE,
        OperationKeys.UPDATE,
        OperationKeys.DELETE,
        BulkCrudOperationKeys.CREATE_ALL,
        BulkCrudOperationKeys.UPDATE_ALL,
        BulkCrudOperationKeys.DELETE_ALL,
      ] as (keyof Adapter<Y, any, any, any>)[]
    ).forEach((method) => {
      if (!adapter[method])
        throw new InternalError(
          `Method ${method} not found in ${adapter.alias} adapter to bind Observables Dispatch`
        );

      let descriptor = Object.getOwnPropertyDescriptor(adapter, method);
      let proto: any = adapter;
      while (!descriptor && proto !== Object.prototype) {
        proto = Object.getPrototypeOf(proto);
        descriptor = Object.getOwnPropertyDescriptor(proto, method);
      }

      if (!descriptor || !descriptor.writable) {
        this.log.error(
          `Could not find method ${method} to bind Observables Dispatch`
        );
        return;
      }
      function bulkToSingle(method: string) {
        switch (method) {
          case BulkCrudOperationKeys.CREATE_ALL:
            return OperationKeys.CREATE;
          case BulkCrudOperationKeys.UPDATE_ALL:
            return OperationKeys.UPDATE;
          case BulkCrudOperationKeys.DELETE_ALL:
            return OperationKeys.DELETE;
          default:
            return method;
        }
      }
      // @ts-expect-error because there are read only properties
      adapter[method] = new Proxy(adapter[method], {
        apply: async (target: any, thisArg, argArray: any[]) => {
          const [tableName, ids] = argArray;
          const result = await target.apply(thisArg, argArray);
          this.updateObservers(tableName, bulkToSingle(method), ids as EventIds)
            .then(() => {
              this.log.verbose(
                `Observer refresh dispatched by ${method} for ${tableName}`
              );
              this.log.debug(`pks: ${ids}`);
            })
            .catch((e: unknown) =>
              this.log.error(
                `Failed to dispatch observer refresh for ${method} on ${tableName}: ${e}`
              )
            );
          return result;
        },
      });
    });
  }

  /**
   * @description Closes the dispatch
   * @summary Performs any necessary cleanup when the dispatch is no longer needed
   * @return {Promise<void>} A promise that resolves when closing is complete
   */
  async close() {
    // to nothing in this instance but may be required for closing connections
  }

  /**
   * @description Starts observing an adapter
   * @summary Connects this dispatch to an adapter to monitor its operations
   * @param {Adapter<Y, any, any, any>} observer - The adapter to observe
   * @return {void}
   */
  observe(observer: Adapter<Y, any, any, any>): void {
    if (!(observer instanceof Adapter))
      throw new UnsupportedError("Only Adapters can be observed by dispatch");
    this.adapter = observer;
    this.native = observer.native;
    this.models = Adapter.models(this.adapter.alias);
    this.initialize().then(() =>
      this.log.verbose(
        `Dispatch initialized for ${this.adapter!.alias} adapter`
      )
    );
  }

  /**
   * @description Stops observing an adapter
   * @summary Disconnects this dispatch from an adapter
   * @param {Observer} observer - The adapter to stop observing
   * @return {void}
   */
  unObserve(observer: Observer): void {
    if (this.adapter !== observer)
      throw new UnsupportedError(
        "Only the adapter that was used to observe can be unobserved"
      );
    this.adapter = undefined;
  }

  /**
   * @description Updates observers about a database event
   * @summary Notifies observers about a change in the database
   * @param {string} table - The name of the table where the change occurred
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of operation that occurred
   * @param {EventIds} id - The identifier(s) of the affected record(s)
   * @return {Promise<void>} A promise that resolves when all observers have been notified
   */
  async updateObservers(
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds
  ): Promise<void> {
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    try {
      await this.adapter.refresh(table, event, id);
    } catch (e: unknown) {
      throw new InternalError(`Failed to refresh dispatch: ${e}`);
    }
  }
}
