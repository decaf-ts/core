import {
  InternalError,
  OperationKeys,
  BulkCrudOperationKeys,
} from "@decaf-ts/db-decorators";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Observer } from "../interfaces";
import { Adapter } from "./Adapter";
import { UnsupportedError } from "./errors";
import { AdapterDispatch, ContextOf, EventIds } from "./types";
import { Constructor } from "@decaf-ts/decoration";
import {
  ContextualArgs,
  ContextualizedArgs,
  ContextualLoggedClass,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";

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
export class Dispatch<A extends Adapter<any, any, any, any>>
  extends ContextualLoggedClass<ContextOf<A>>
  implements AdapterDispatch<A>
{
  /**
   * @description The adapter being observed
   * @summary Reference to the database adapter whose operations are being monitored
   */
  protected adapter?: A;

  /**
   * @description List of model constructors
   * @summary Array of model constructors that are registered with the adapter
   */
  protected models!: ModelConstructor<any>[];

  /**
   * @description Creates a new Dispatch instance
   * @summary Initializes a new Dispatch instance without any adapter
   */
  constructor() {
    super();
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<ContextOf<A>, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<A>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<A>,
        ARGS,
        METHOD extends string ? true : false
      > {
    if (!this.adapter) throw new InternalError("Adapter not set yet");
    return this.adapter["logCtx"](args, operation, allowCreate as any) as
      | ContextualizedArgs<
          ContextOf<A>,
          ARGS,
          METHOD extends string ? true : false
        >
      | Promise<
          ContextualizedArgs<
            ContextOf<A>,
            ARGS,
            METHOD extends string ? true : false
          >
        >;
  }

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
  protected async initialize(
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<void> {
    if (!this.adapter) {
      // Gracefully skip initialization when no adapter is observed yet.
      // Some tests or setups may construct a Dispatch before calling observe().
      // Instead of throwing, we no-op so that later observe() can proceed.
      this.log
        .for(this.initialize)
        .verbose(`No adapter observed for dispatch; skipping initialization`);
      return;
    }
    const { log } = await this.logCtx(args, this.initialize, true);
    log.verbose(`Initializing ${this.adapter}'s event Dispatch`);
    const adapter = this.adapter as Adapter<any, any, any, any>;
    (
      [
        OperationKeys.CREATE,
        OperationKeys.UPDATE,
        OperationKeys.DELETE,
        BulkCrudOperationKeys.CREATE_ALL,
        BulkCrudOperationKeys.UPDATE_ALL,
        BulkCrudOperationKeys.DELETE_ALL,
      ] as (keyof Adapter<any, any, any, any>)[]
    ).forEach((toWrap) => {
      if (!adapter[toWrap])
        throw new InternalError(
          `Method ${toWrap} not found in ${adapter.alias} adapter to bind Observables Dispatch`
        );

      let descriptor = Object.getOwnPropertyDescriptor(adapter, toWrap);
      let proto: any = adapter;
      while (!descriptor && proto !== Object.prototype) {
        proto = Object.getPrototypeOf(proto);
        descriptor = Object.getOwnPropertyDescriptor(proto, toWrap);
      }

      if (!descriptor || !descriptor.writable) {
        this.log.error(
          `Could not find method ${toWrap} to bind Observables Dispatch`
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
      adapter[toWrap] = new Proxy(adapter[toWrap], {
        apply: async (target: any, thisArg: A, argArray: any[]) => {
          const { log, ctxArgs } = thisArg["logCtx"](argArray, target);
          const [tableName, ids] = argArray;
          const result = await target.apply(thisArg, ctxArgs);

          this.updateObservers(
            tableName,
            bulkToSingle(toWrap),
            ids as EventIds,
            result,
            ...(ctxArgs.slice(argArray.length) as ContextualArgs<ContextOf<A>>)
          )
            .then(() => {
              log.verbose(
                `Observer refresh dispatched by ${toWrap} for ${tableName}`
              );
              log.debug(`pks: ${ids}`);
            })
            .catch((e: unknown) =>
              log.error(
                `Failed to dispatch observer refresh for ${toWrap} on ${tableName}: ${e}`
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
  async close(): Promise<void> {
    // to nothing in this instance but may be required for closing connections
  }

  /**
   * @description Starts observing an adapter
   * @summary Connects this dispatch to an adapter to monitor its operations
   * @param {Adapter<any, any, any, any>} observer - The adapter to observe
   * @return {void}
   */
  observe(observer: A): void {
    if (!(observer instanceof Adapter))
      throw new UnsupportedError("Only Adapters can be observed by dispatch");
    this.adapter = observer;
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
    model: Constructor<any> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void> {
    const table = typeof model === "string" ? model : Model.tableName(model);
    const { log, ctxArgs } = this.logCtx(args, this.updateObservers);
    if (!this.adapter) {
      log.verbose(
        `No adapter observed for dispatch; skipping observer update for ${table}:${event}`
      );
      return;
    }
    try {
      log.debug(
        `Dispatching ${event} from table ${table} for ${event} with id: ${JSON.stringify(id)}`
      );
      await this.adapter.refresh(model, event, id, ...ctxArgs);
    } catch (e: unknown) {
      throw new InternalError(`Failed to refresh dispatch: ${e}`);
    }
  }
}

if (Adapter) Adapter["_baseDispatch"] = Dispatch;
