import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
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
import { PersistenceKeys } from "./constants";

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
  private isSameObservedAdapter(observer: Observer): boolean {
    if (!this.adapter) return false;
    if (this.adapter === observer) return true;

    const current = this.adapter as unknown as Adapter<any, any, any, any>;
    const candidate = observer as unknown as Adapter<any, any, any, any>;
    if (!(candidate instanceof Adapter)) return false;

    return (
      current.alias === candidate.alias && current.flavour === candidate.flavour
    );
  }

  /**
   * Indicates whether the dispatcher has already been initialized.
   *
   * @description Tracks the initialization state to prevent duplicate setup
   * @summary Whether the dispatcher is initialized and ready to observe adapter operations
   */
  protected initialized: boolean = false;

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

  /** generation of the listening session; {@link close} and {@link dispose} supersede it */
  private listeningGeneration = 0;

  /** the session start in flight (see {@link start}), awaited by {@link close} */
  private startInFlight?: Promise<void>;

  /** set by {@link dispose} until {@link revive}: no session is started meanwhile */
  private disposedUntilRevived = false;

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

    if (this.initialized) {
      this.log
        .for(this.initialize)
        .debug(
          "Dispatcher already initialized; skipping initialization to prevent duplicate setup"
        );
      return;
    }

    const { log } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    log.verbose(`Initializing ${this.adapter}'s event Dispatch`);
    this.initialized = true;

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
          const { log, ctxArgs, ctx } = thisArg["logCtx"](
            argArray.slice(3 - (4 - argArray.length), argArray.length),
            target
          );
          const [tableName, ids, payload] = argArray;
          const result = await target.apply(thisArg, [
            tableName,
            ids,
            payload,
            ...ctxArgs,
          ]);

          const resultArgs: [string, string, EventIds] = [
            tableName,
            bulkToSingle(toWrap),
            ids,
          ];

          if (ctx.get("observeFullResult")) {
            resultArgs.push(
              Array.isArray(result)
                ? result.map((r) => tableName(r))
                : tableName(result)
            );
          }
          this.updateObservers(...resultArgs, ...ctxArgs).catch((e: unknown) =>
            log.error(
              `Failed to dispatch observer refresh for ${toWrap} on ${tableName.name || tableName} for ${ids}: ${e}`
            )
          );
          return result;
        },
      });
    });
  }

  /**
   * @description Generation of the current listening session
   * @summary Dispatches that connect to a backend asynchronously capture it when
   * they start and check {@link isSuperseded} after every await: once the dispatch
   * was closed (or disposed) meanwhile, they must abandon the start instead of
   * opening a connection nobody would close.
   * @return {number} The current generation
   */
  protected currentGeneration(): number {
    return this.listeningGeneration;
  }

  /**
   * @description Whether a session started at `generation` was closed since
   * @param {number} generation - The value of {@link currentGeneration} when the session started
   * @return {boolean} True when the session was closed or the dispatch disposed
   */
  protected isSuperseded(generation: number): boolean {
    return this.disposedUntilRevived || generation !== this.listeningGeneration;
  }

  /**
   * @description Starts a listening session
   * @summary Runs {@link initialize} as the current session, tracking it so
   * {@link close} can wait for it. Failures are logged, never left as unhandled
   * rejections. No-op while the dispatch is disposed.
   * @param {...MaybeContextualArg} args - Arguments forwarded to {@link initialize}
   * @return {Promise<void>} Resolves once the start settled (never rejects)
   */
  protected start(...args: MaybeContextualArg<ContextOf<A>>): Promise<void> {
    const log = this.log.for(this.start);
    if (this.disposedUntilRevived) {
      log.verbose(`Dispatch disposed; not starting until revived`);
      return Promise.resolve();
    }
    const run = this.initialize(...args).then(
      () =>
        log.verbose(
          `Dispatch initialized for ${this.adapter?.alias ?? "unknown"} adapter`
        ),
      (e: unknown) =>
        log.error(
          `Failed to initialize dispatch for ${this.adapter?.alias ?? "unknown"} adapter: ${e}`
        )
    );
    this.startInFlight = run;
    void run.then(() => {
      if (this.startInFlight === run) this.startInFlight = undefined;
    });
    return run;
  }

  /**
   * @description Closes the dispatch
   * @summary Supersedes the current listening session and waits for a start
   * still in flight to settle, so nothing it opens outlives the call. Overrides
   * release their own connections and must call `super.close()`.
   * @param {...ContextualArgs} ctxArgs - Contextual arguments
   * @return {Promise<void>} A promise that resolves when closing is complete
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async close(...ctxArgs: ContextualArgs<ContextOf<A>>): Promise<void> {
    this.listeningGeneration++;
    const starting = this.startInFlight;
    this.startInFlight = undefined;
    if (starting) await starting;
  }

  /**
   * @description Stops the dispatch until it is revived
   * @summary Called when the adapter shuts down, before {@link close}: supersedes
   * any session still starting and prevents new ones — even when observers
   * register — until {@link revive}.
   */
  dispose(): void {
    this.disposedUntilRevived = true;
    this.listeningGeneration++;
  }

  /**
   * @description Re-enables a disposed dispatch
   * @summary Called when the adapter is initialized again after a shutdown: undoes
   * {@link dispose} and starts listening again when observers are registered.
   * No-op when the dispatch was not disposed.
   * @return {Promise<void>} Resolves once the new session start settled
   */
  async revive(): Promise<void> {
    if (!this.disposedUntilRevived) return;
    this.disposedUntilRevived = false;
    if (!this.adapter) return;
    const observers =
      (this.adapter as any)["observerHandler"]?.count?.() ?? 0;
    if (observers > 0) await this.start();
  }

  /**
   * @description Starts observing an adapter
   * @summary Connects this dispatch to an adapter to monitor its operations
   * @param {Adapter<any, any, any, any>} observer - The adapter to observe
   * @return {void}
   */
  observe(observer: A): () => void {
    if (!(observer instanceof Adapter))
      throw new UnsupportedError("Only Adapters can be observed by dispatch");

    if (this.adapter) {
      if (this.isSameObservedAdapter(observer))
        return () => this.unObserve(observer);
      throw new UnsupportedError(
        "Dispatch is already observing another adapter"
      );
    }

    this.adapter = observer;
    this.models = Adapter.models(this.adapter.alias);
    void this.start();

    return () => this.unObserve(observer);
  }

  /**
   * @description Stops observing an adapter
   * @summary Disconnects this dispatch from an adapter
   * @param {Observer} observer - The adapter to stop observing
   * @return {void}
   */
  unObserve(observer: Observer): void {
    if (!this.isSameObservedAdapter(observer))
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
    if (!model)
      throw new InternalError(`Model must be provided for observer update`);
    const table =
      model && typeof model === "string" ? model : Model.tableName(model);

    if (!this.adapter) {
      const log = this.log.for(this.updateObservers);
      log.debug(
        `No adapter observed for dispatch; skipping observer update for ${table}:${event}`
      );
      return;
    }

    const { log, ctxArgs, ctx } = this.logCtx(args, this.updateObservers);
    try {
      log.debug(
        `dispatching observer refresh for ${event}:${table}: ${id}${ctx.get("observeFullResult") ? " - including result" : ""}`
      );
      await this.adapter.refresh(model, event, id, ...ctxArgs);
    } catch (e: unknown) {
      throw new InternalError(`Failed to refresh dispatch: ${e}`);
    }
  }

  override toString() {
    return `${this.adapter ? this.adapter.toString() : "uninitialized"} event dispatch`;
  }
}

if (Adapter) Adapter["_baseDispatch"] = Dispatch;
