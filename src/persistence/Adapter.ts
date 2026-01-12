import {
  BaseError,
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  PrimaryKeyType,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { type Observer } from "../interfaces/Observer";
import {
  hashObj,
  Model,
  ModelConstructor,
} from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { RawPagedExecutor } from "../interfaces/RawExecutor";
import { DefaultAdapterFlags, PersistenceKeys } from "./constants";
import type { Repository } from "../repository/Repository";
import type { Sequence } from "./Sequence";
import { ErrorParser } from "../interfaces";
import { Statement } from "../query/Statement";
import { final, Impersonatable, Logger, Logging } from "@decaf-ts/logging";
import type { Dispatch } from "./Dispatch";
import {
  AdapterDispatch,
  type AdapterFlags,
  AllOperationKeys,
  type EventIds,
  FlagsOf,
  type ObserverFilter,
  PersistenceObservable,
  PersistenceObserver,
  PreparedModel,
  RawResult,
} from "./types";
import { ObserverHandler } from "./ObserverHandler";
import { Context } from "./Context";
import {
  type Constructor,
  Decoration,
  DefaultFlavour,
  Metadata,
} from "@decaf-ts/decoration";
import {
  AbsContextual,
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { Paginator } from "../query/Paginator";
import { PreparedStatement } from "../query/index";
import { promiseSequence } from "../utils/utils";
import { UUID } from "./generators";

const flavourResolver = Decoration["flavourResolver"].bind(Decoration);
Decoration["flavourResolver"] = (obj: object) => {
  try {
    const result = flavourResolver(obj);
    if (result && result !== DefaultFlavour) return result;
    const targetCtor =
      typeof obj === "function"
        ? (obj as Constructor)
        : ((obj as { constructor?: Constructor })?.constructor as
            | Constructor
            | undefined);
    const registeredFlavour =
      targetCtor && typeof Metadata["registeredFlavour"] === "function"
        ? Metadata.registeredFlavour(targetCtor)
        : undefined;
    if (registeredFlavour && registeredFlavour !== DefaultFlavour)
      return registeredFlavour;
    const currentFlavour = Adapter["_currentFlavour"];
    if (currentFlavour) {
      const cachedAdapter = Adapter["_cache"]?.[currentFlavour];
      if (cachedAdapter?.flavour) return cachedAdapter.flavour;
      return currentFlavour;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    return DefaultFlavour;
  }
};

export type AdapterSubClass<A> =
  A extends Adapter<any, any, any, any> ? A : never;

/**
 * @description Abstract Facade class for persistence adapters
 * @summary Provides the foundation for all database adapters in the persistence layer. This class
 * implements several interfaces to provide a consistent API for database operations, observer
 * pattern support, and error handling. It manages adapter registration, CRUD operations, and
 * observer notifications.
 * @template CONFIG - The underlying persistence driver config
 * @template QUERY - The query object type used by the adapter
 * @template FLAGS - The repository flags type
 * @template CONTEXT - The context type
 * @param {CONFIG} _config - The underlying persistence driver config
 * @param {string} flavour - The identifier for this adapter type
 * @param {string} [_alias] - Optional alternative name for this adapter
 * @class Adapter
 * @example
 * ```typescript
 * // Implementing a concrete adapter
 * class PostgresAdapter extends Adapter<pg.PoolConfig, pg.Query, PostgresFlags, PostgresContext> {
 *   constructor(client: pg.PoolConfig) {
 *     super(client, 'postgres');
 *   }
 *
 *   async initialize() {
 *     // Set up the adapter
 *     await this.native.connect();
 *   }
 *
 *   async create(tableName, id, model) {
 *     // Implementation for creating records
 *     const columns = Object.keys(model).join(', ');
 *     const values = Object.values(model);
 *     const placeholders = values.map((_, i) => `$${i+1}`).join(', ');
 *
 *     const query = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
 *     const result = await this.native.query(query, values);
 *     return result.rows[0];
 *   }
 *
 *   // Other required method implementations...
 * }
 *
 * // Using the adapter
 * const pgClient = new pg.Client(connectionString);
 * const adapter = new PostgresAdapter(pgClient);
 * await adapter.initialize();
 *
 * // Set as the default adapter
 * Adapter.setCurrent('postgres');
 *
 * // Perform operations
 * const user = await adapter.create('users', 1, { name: 'John', email: 'john@example.com' });
 * ```
 * @mermaid
 * classDiagram
 *   class Adapter {
 *     +Y native
 *     +string flavour
 *     +string alias
 *     +create(tableName, id, model)
 *     +read(tableName, id)
 *     +update(tableName, id, model)
 *     +delete(tableName, id)
 *     +observe(observer, filter)
 *     +unObserve(observer)
 *     +static current
 *     +static get(flavour)
 *     +static setCurrent(flavour)
 *   }
 *
 *   class RawExecutor {
 *     +raw(query)
 *   }
 *
 *   class Observable {
 *     +observe(observer, filter)
 *     +unObserve(observer)
 *     +updateObservers(table, event, id)
 *   }
 *
 *   class Observer {
 *     +refresh(table, event, id)
 *   }
 *
 *   class ErrorParser {
 *     +parseError(err)
 *   }
 *
 *   Adapter --|> RawExecutor
 *   Adapter --|> Observable
 *   Adapter --|> Observer
 *   Adapter --|> ErrorParser
 */
export abstract class Adapter<
    CONF,
    CONN,
    QUERY,
    CONTEXT extends Context<AdapterFlags> = Context<AdapterFlags>,
  >
  extends AbsContextual<CONTEXT>
  implements
    RawPagedExecutor<QUERY>,
    PersistenceObservable<CONTEXT>,
    PersistenceObserver<CONTEXT>,
    Impersonatable<any, [Partial<CONF>, ...any[]]>,
    ErrorParser
{
  private static _currentFlavour: string;
  private static _cache: Record<string, Adapter<any, any, any, any>> = {};
  private static _baseRepository: Constructor<Repository<any, any>>;
  private static _baseSequence: Constructor<Sequence>;
  private static _baseDispatch: Constructor<
    Dispatch<Adapter<any, any, any, any>>
  >;

  protected dispatch?: AdapterDispatch<typeof this>;

  protected readonly observerHandler?: ObserverHandler;

  protected _client?: CONN;

  /**
   * @description Gets the native persistence config
   * @summary Provides access to the underlying persistence driver config
   * @template CONF
   * @return {CONF} The native persistence driver config
   */
  get config(): CONF {
    return this._config;
  }

  /**
   * @description Gets the adapter's alias or flavor name
   * @summary Returns the alias if set, otherwise returns the flavor name
   * @return {string} The adapter's identifier
   */
  get alias(): string {
    return this._alias || this.flavour;
  }

  /**
   * @description Gets the repository constructor for this adapter
   * @summary Returns the constructor for creating repositories that work with this adapter
   * @template M - The model type
   * @return {Constructor<Repository<any, Adapter<CONF, CONN, QUERY, CONTEXT>>>} The repository constructor
   */
  repository<
    R extends Repository<any, Adapter<CONF, CONN, QUERY, CONTEXT>>,
  >(): Constructor<R> {
    if (!Adapter._baseRepository)
      throw new InternalError(
        `This should be overridden when necessary. Otherwise it will be replaced lazily`
      );
    return Adapter._baseRepository as Constructor<R>;
  }

  @final()
  protected async shutdownProxies(k?: string) {
    if (!this.proxies) return;
    if (k && !(k in this.proxies))
      throw new InternalError(`No proxy found for ${k}`);
    if (!k) {
      for (const key in this.proxies) {
        try {
          await this.proxies[key].shutdown();
        } catch (e: unknown) {
          this.log.error(`Failed to shutdown proxied adapter ${key}: ${e}`);
          continue;
        }
        delete this.proxies[key];
      }
    } else {
      try {
        await this.proxies[k].shutdown();
        delete this.proxies[k];
      } catch (e: unknown) {
        this.log.error(`Failed to shutdown proxied adapter ${k}: ${e}`);
      }
    }
  }

  /**
   * @description Shuts down the adapter
   * @summary Performs any necessary cleanup tasks, such as closing connections
   * When overriding this method, ensure to call the base method first
   * @return {Promise<void>} A promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    await this.shutdownProxies();
    if (this.dispatch) await this.dispatch.close();
  }

  /**
   * @description Creates a new adapter instance
   * @summary Initializes the adapter with the native driver and registers it in the adapter cache
   */
  protected constructor(
    private readonly _config: CONF,
    readonly flavour: string,
    private readonly _alias?: string
  ) {
    super();
    if (this.alias in Adapter._cache)
      throw new InternalError(
        `${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} already registered`
      );
    Adapter._cache[this.alias] = this;
    this.log.info(
      `Created ${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} persistence adapter`
    );
    if (!Adapter._currentFlavour) {
      this.log.verbose(`Defined ${this.alias} persistence adapter as current`);
      Adapter._currentFlavour = this.alias;
    }
  }

  /**
   * @description Creates a new statement builder for a model
   * @summary Returns a statement builder that can be used to construct queries for a specific model
   * @template M - The model type
   * @return {Statement} A statement builder for the model
   */
  abstract Statement<M extends Model>(
    overrides?: Partial<AdapterFlags>
  ): Statement<M, Adapter<CONF, CONN, QUERY, CONTEXT>, any>;

  abstract Paginator<M extends Model>(
    query: QUERY | PreparedStatement<M>,
    size: number,
    clazz: Constructor<M>
  ): Paginator<M, any, QUERY>;

  /**
   * @description Creates a new dispatch instance
   * @summary Factory method that creates a dispatch instance for this adapter
   * @return {Dispatch} A new dispatch instance
   */
  protected Dispatch(): Dispatch<Adapter<CONF, CONN, QUERY, CONTEXT>> {
    return new Adapter._baseDispatch() as Dispatch<
      Adapter<CONF, CONN, QUERY, CONTEXT>
    >;
  }

  /**
   * @description Creates a new observer handler
   * @summary Factory method that creates an observer handler for this adapter
   * @return {ObserverHandler} A new observer handler instance
   */
  protected ObserverHandler(): ObserverHandler {
    return new ObserverHandler();
  }

  /**
   * @description Checks if an attribute name is reserved
   * @summary Determines if a given attribute name is reserved and cannot be used as a column name
   * @param {string} attr - The attribute name to check
   * @return {boolean} True if the attribute is reserved, false otherwise
   */
  protected isReserved(attr: string): boolean {
    return !attr;
  }

  /**
   * @description Parses a database error into a standardized error
   * @summary Converts database-specific errors into standardized application errors
   * @param {Error} err - The original database error
   * @param args
   * @return {BaseError} A standardized error
   */
  abstract parseError<E extends BaseError>(err: Error, ...args: any[]): E;

  /**
   * @description Initializes the adapter
   * @summary Performs any necessary setup for the adapter, such as establishing connections
   * @param {...any[]} args - Initialization arguments
   * @return {Promise<void>} A promise that resolves when initialization is complete
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {}

  /**
   * @description Creates a sequence generator
   * @summary Factory method that creates a sequence generator for generating sequential values
   * @param {SequenceOptions} options - Configuration options for the sequence
   * @return {Promise<Sequence>} A promise that resolves to a new sequence instance
   */
  async Sequence(
    options: SequenceOptions,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<Sequence> {
    return new Adapter._baseSequence(options, this, overrides);
  }

  /**
   * @description Creates repository flags for an operation
   * @summary Generates a set of flags that describe a database operation, combining default flags with overrides
   * @template F - The Repository Flags type
   * @template M - The model type
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<F>} flags - Custom flag overrides
   * @param {...any[]} args - Additional arguments
   * @return {Promise<F>} The complete set of flags
   */
  protected async flags<M extends Model>(
    operation: OperationKeys | string,
    model: Constructor<M> | Constructor<M>[] | undefined,
    flags: Partial<FlagsOf<CONTEXT>>,
    ...args: MaybeContextualArg<CONTEXT>
  ): Promise<FlagsOf<CONTEXT>> {
    if (typeof model === "string") {
      throw new InternalError(
        "Model must be a constructor or array of constructors or undefined. this should be impossible"
      );
    }
    const targetModel = Array.isArray(model)
      ? model.length
        ? model[0]
        : undefined
      : model;
    const correlationPrefix = targetModel
      ? `${Model.tableName(targetModel)} - `
      : "";
    flags.correlationId =
      flags.correlationId ||
      `${correlationPrefix}${operation}-${UUID.instance.generate()}`;
    const log = (flags.logger || Logging.for(this as any)) as Logger;
    log.setConfig({ correlationId: flags.correlationId });
    return Object.assign({}, DefaultAdapterFlags, flags, {
      affectedTables: model
        ? [
            ...new Set([
              ...(Array.isArray(model) ? model : [model]).filter(Boolean),
              ...(flags.affectedTables
                ? Array.isArray(flags.affectedTables)
                  ? flags.affectedTables
                  : [flags.affectedTables]
                : []),
            ]),
          ]
        : flags.affectedTables,
      args: args,
      writeOperation: operation !== OperationKeys.READ,
      timestamp: new Date(),
      operation: operation,
      ignoredValidationProperties: model
        ? Metadata.validationExceptions(
            Array.isArray(model) && model[0]
              ? (model[0] as Constructor)
              : (model as Constructor),
            operation as any
          )
        : [],
      logger: log,
    }) as unknown as FlagsOf<CONTEXT>;
  }

  /**
   * @description The context constructor for this adapter
   * @summary Reference to the context class constructor used by this adapter
   */
  protected override get Context(): Constructor<CONTEXT> {
    return Context<FlagsOf<CONTEXT>> as unknown as Constructor<CONTEXT>;
  }

  /**
   * @description Creates a context for a database operation
   * @summary Generates a context object that describes a database operation, used for tracking and auditing
   * @template F - The Repository flags type
   * @template M - The model type
   * @param {OperationKeys.CREATE|OperationKeys.READ|OperationKeys.UPDATE|OperationKeys.DELETE} operation - The type of operation
   * @param {Partial<F>} overrides - Custom flag overrides
   * @param {Constructor<M>} model - The model constructor
   * @param {...any[]} args - Additional arguments
   * @return {Promise<C>} A promise that resolves to the context object
   */
  @final()
  override async context<M extends Model>(
    operation: ((...args: any[]) => any) | AllOperationKeys,
    overrides: Partial<FlagsOf<CONTEXT>>,
    model: Constructor<M> | Constructor<M>[],
    ...args: MaybeContextualArg<Context<any>>
  ): Promise<CONTEXT> {
    const log = this.log.for(this.context);
    log.silly(
      `creating new context for ${operation} operation on ${model ? (Array.isArray(model) ? model.map((m) => Model.tableName(m)) : Model.tableName(model)) : "no"} table ${overrides && Object.keys(overrides) ? Object.keys(overrides).length : "no"} with flag overrides`
    );
    let ctx = args.pop();
    if (typeof ctx !== "undefined" && !(ctx instanceof Context)) {
      args.push(ctx);
      ctx = undefined;
    }

    const flags = await this.flags(
      typeof operation === "string" ? operation : operation.name,
      model,
      overrides as Partial<FlagsOf<CONTEXT>>,
      ...args
    );
    if (ctx) {
      return new this.Context(ctx).accumulate({
        ...flags,
        parentContext: ctx,
      }) as any;
    }
    return new this.Context().accumulate(flags) as any;
  }

  /**
   * @description Prepares a model for persistence
   * @summary Converts a model instance into a format suitable for database storage,
   * handling column mapping and separating transient properties
   * handling column mapping and separating transient properties
   * @template M - The model type
   * @param {M} model - The model instance to prepare
   * @param args - optional args for subclassing purposes
   * @return The prepared data
   */
  prepare<M extends Model>(
    model: M,
    ...args: ContextualArgs<CONTEXT>
  ): PreparedModel {
    const { log } = this.logCtx(args, this.prepare);
    const split = model.segregate();
    const result = Object.entries(split.model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (typeof val === "undefined") return accum;
        const mappedProp: string = Model.columnName(
          model.constructor as Constructor<M>,
          key as keyof M
        );
        if (this.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
    if ((model as any)[PersistenceKeys.METADATA]) {
      // TODO movo to couchdb
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: true,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    return {
      record: result,
      id: model[Model.pk(model.constructor as Constructor<M>)] as string,
      transient: split.transient,
    };
  }

  /**
   * @description Converts database data back into a model instance
   * @summary Reconstructs a model instance from database data, handling column mapping
   * and reattaching transient properties
   * @template M - The model type
   * @param obj - The database record
   * @param {Constructor<M>} clazz - The model class or name
   * @param pk - The primary key property name
   * @param {string|number|bigint} id - The primary key value
   * @param [transient] - Transient properties to reattach
   * @param [args] - options args for subclassing purposes
   * @return {M} The reconstructed model instance
   */
  revert<M extends Model>(
    obj: Record<string, any>,
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    transient?: Record<string, any>,
    ...args: ContextualArgs<CONTEXT>
  ): M {
    const { log, ctx } = this.logCtx(args, this.revert);
    const ob: Record<string, any> = {};
    const pk = Model.pk(clazz);
    ob[pk as string] = id;
    const m = new clazz(ob) as M;
    log.silly(`Rebuilding model ${m.constructor.name} id ${id}`);
    const metadata = obj[PersistenceKeys.METADATA]; // TODO move to couchdb
    const result = Object.keys(m).reduce((accum: M, key) => {
      (accum as Record<string, any>)[key] =
        obj[Model.columnName(clazz, key as keyof M)];
      return accum;
    }, m);

    if (ctx.get("rebuildWithTransient") && transient) {
      log.verbose(
        `re-adding transient properties: ${Object.keys(transient).join(", ")}`
      );
      Object.entries(transient).forEach(([key, val]) => {
        if (key in result)
          throw new InternalError(
            `Transient property ${key} already exists on model ${m.constructor.name}. should be impossible`
          );
        result[key as keyof M] = val;
      });
    }

    if (metadata) {
      // TODO move to couchdb
      log.silly(
        `Passing along ${this.flavour} persistence metadata for ${m.constructor.name} id ${id}: ${metadata}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: true,
        writable: true,
        value: metadata,
      });
    }

    return result;
  }

  /**
   * @description Creates a new record in the database
   * @summary Inserts a new record with the given ID and data into the specified table
   * @param {string} clazz - The name of the table to insert into
   * @param {PrimaryKeyType} id - The identifier for the new record
   * @param model - The data to insert
   * @param {any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to the created record
   */
  abstract create<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>>;

  /**
   * @description Creates multiple records in the database
   * @summary Inserts multiple records with the given IDs and data into the specified table
   * @param {string} tableName - The name of the table to insert into
   * @param id - The identifiers for the new records
   * @param model - The data to insert for each record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to an array of created records
   */
  async createAll<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType[],
    model: Record<string, any>[],
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>[]> {
    const { log, ctxArgs } = this.logCtx(args, this.createAll);
    if (!id || !model)
      throw new ValidationError("Ids and models cannot be null or undefined");
    if (id.length !== model.length)
      throw new ValidationError("Ids and models must have the same length");
    const tableLabel = Model.tableName(clazz);
    log.debug(`Creating ${id.length} entries ${tableLabel} table`);
    return promiseSequence(
      id.map(
        (i, count) => () => this.create(clazz, i, model[count], ...ctxArgs)
      )
    );
  }

  /**
   * @description Retrieves a record from the database
   * @summary Fetches a record with the given ID from the specified table
   * @param {string} tableName - The name of the table to read from
   * @param {string|number|bigint} id - The identifier of the record to retrieve
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to the retrieved record
   */
  abstract read<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>>;

  /**
   * @description Retrieves multiple records from the database
   * @summary Fetches multiple records with the given IDs from the specified table
   * @param {string} tableName - The name of the table to read from
   * @param id - The identifiers of the records to retrieve
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to an array of retrieved records
   */
  async readAll<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType[],
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>[]> {
    const { log, ctxArgs } = this.logCtx(args, this.readAll);
    const tableName = Model.tableName(clazz);
    log.debug(`Reading ${id.length} entries ${tableName} table`);
    return promiseSequence(
      id.map((i) => () => this.read(clazz, i, ...ctxArgs))
    );
  }

  /**
   * @description Updates a record in the database
   * @summary Modifies an existing record with the given ID in the specified table
   * @template M - The model type
   * @param {Constructor<M>} tableName - The name of the table to update
   * @param {PrimaryKeyType} id - The identifier of the record to update
   * @param  model - The new data for the record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to the updated record
   */
  abstract update<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>>;

  /**
   * @description Updates multiple records in the database
   * @summary Modifies multiple existing records with the given IDs in the specified table
   * @param {Constructor<M>} tableName - The name of the table to update
   * @param {string[]|number[]} id - The identifiers of the records to update
   * @param model - The new data for each record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to an array of updated records
   */
  async updateAll<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType[],
    model: Record<string, any>[],
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>[]> {
    const { log, ctxArgs } = this.logCtx(args, this.updateAll);
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const tableLabel = Model.tableName(clazz);
    log.debug(`Updating ${id.length} entries ${tableLabel} table`);
    return promiseSequence(
      id.map(
        (i, count) => () => this.update(clazz, i, model[count], ...ctxArgs)
      )
    );
  }

  /**
   * @description Deletes a record from the database
   * @summary Removes a record with the given ID from the specified table
   * @param {string} tableName - The name of the table to delete from
   * @param {string|number|bigint} id - The identifier of the record to delete
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to the deleted record
   */
  abstract delete<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>>;

  /**
   * @description Deletes multiple records from the database
   * @summary Removes multiple records with the given IDs from the specified table
   * @param {string} tableName - The name of the table to delete from
   * @param id - The identifiers of the records to delete
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return A promise that resolves to an array of deleted records
   */
  async deleteAll<M extends Model>(
    tableName: Constructor<M>,
    id: PrimaryKeyType[],
    ...args: ContextualArgs<CONTEXT>
  ): Promise<Record<string, any>[]> {
    const { log, ctxArgs } = this.logCtx(args, this.deleteAll);
    log.debug(`Deleting ${id.length} entries from ${tableName} table`);
    return promiseSequence(
      id.map((i) => () => this.delete(tableName, i, ...ctxArgs))
    );
  }

  /**
   * @description Executes a raw query against the database
   * @summary Allows executing database-specific queries directly
   * @template Q - The raw query type
   * @template R - The return type of the query
   * @param {Q} rawInput - The query to execute
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<R>} A promise that resolves to the query result
   */
  abstract raw<R, D extends boolean>(
    rawInput: QUERY,
    docsOnly: D,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<RawResult<R, D>>;

  /**
   * @description Registers an observer for database events
   * @summary Adds an observer to be notified about database changes. The observer can optionally
   * provide a filter function to receive only specific events.
   * @param {Observer} observer - The observer to register
   * @param {ObserverFilter} [filter] - Optional filter function to determine which events the observer receives
   * @return {void}
   */
  @final()
  observe(observer: Observer, filter?: ObserverFilter): void {
    if (!this.observerHandler)
      Object.defineProperty(this, "observerHandler", {
        value: this.ObserverHandler(),
        writable: false,
      });
    this.observerHandler!.observe(observer, filter);
    const log = this.log.for(this.observe);
    log.silly(`Registering new observer ${observer.toString()}`);
    if (!this.dispatch) {
      log.verbose(`Creating dispatch for ${this.alias}`);
      this.dispatch = this.Dispatch();
      this.dispatch.observe(this);
    }
  }

  /**
   * @description Unregisters an observer
   * @summary Removes a previously registered observer so it no longer receives database event notifications
   * @param {Observer} observer - The observer to unregister
   * @return {void}
   */
  @final()
  unObserve(observer: Observer): void {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    this.observerHandler.unObserve(observer);
    this.log
      .for(this.unObserve)
      .debug(`Observer ${observer.toString()} removed`);
  }

  /**
   * @description Notifies all observers about a database event
   * @summary Sends notifications to all registered observers about a change in the database,
   * filtering based on each observer's filter function
   * @param {string} table - The name of the table where the change occurred
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of operation that occurred
   * @param {EventIds} id - The identifier(s) of the affected record(s)
   * @param {...any[]} args - Additional arguments to pass to the observers
   * @return {Promise<void>} A promise that resolves when all observers have been notified
   */
  async updateObservers<M extends Model>(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<CONTEXT>
  ): Promise<void> {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    await this.observerHandler.updateObservers(table, event, id, ...args);
  }

  /**
   * @description Refreshes data based on a database event
   * @summary Implementation of the Observer interface method that delegates to updateObservers
   * @param {string} table - The name of the table where the change occurred
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of operation that occurred
   * @param {EventIds} id - The identifier(s) of the affected record(s)
   * @param {...any[]} args - Additional arguments related to the event
   * @return {Promise<void>} A promise that resolves when the refresh is complete
   */
  async refresh<M extends Model>(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<CONTEXT>
  ) {
    return this.updateObservers(table, event, id, ...args);
  }

  /**
   * @description Gets a string representation of the adapter
   * @summary Returns a human-readable string identifying this adapter
   * @return {string} A string representation of the adapter
   */
  override toString(): string {
    return `${this.flavour} adapter`;
  }

  /**
   * @description Gets the adapter flavor associated with a model
   * @summary Retrieves the adapter flavor that should be used for a specific model class
   * @template M - The model type
   * @param {Constructor<M>} model - The model constructor
   * @return {string} The adapter flavor name
   */
  static flavourOf<M extends Model>(model: Constructor<M>): string {
    return Metadata.flavourOf(model);
  }

  static get currentFlavour() {
    if (!Adapter._currentFlavour)
      throw new InternalError(
        `No persistence flavour set. Please initialize your adapter`
      );
    return Adapter._currentFlavour;
  }

  /**
   * @description Gets the current default adapter
   * @summary Retrieves the adapter that is currently set as the default for operations
   * @return {Adapter<any, any, any, any>} The current adapter
   */
  static get current(): Adapter<any, any, any, any> | undefined {
    return Adapter.get(this.currentFlavour);
  }

  /**
   * @description Gets an adapter by flavor
   * @summary Retrieves a registered adapter by its flavor name
   * @template CONF - The database driver config
   * @template CONN - The database driver instance
   * @template QUERY - The query type
   * @template CONTEXT - The context type
   * @param {string} flavour - The flavor name of the adapter to retrieve
   * @return {Adapter<CONF, CONN, QUERY, CONTEXT> | undefined} The adapter instance or undefined if not found
   */
  static get<A extends Adapter<any, any, any, any>>(
    flavour?: any
  ): A | undefined {
    if (!flavour) return Adapter.get(this._currentFlavour);
    if (flavour in this._cache) return this._cache[flavour] as A;
    throw new InternalError(`No Adapter registered under ${flavour}.`);
  }

  /**
   * @description Sets the current default adapter
   * @summary Changes which adapter is used as the default for operations
   * @param {string} flavour - The flavor name of the adapter to set as current
   * @return {void}
   */
  static setCurrent(flavour: string): void {
    this._currentFlavour = flavour;
  }

  /**
   * @description Gets all models associated with an adapter flavor
   * @summary Retrieves all model constructors that are configured to use a specific adapter flavor
   * @template M - The model type
   * @param {string} flavour - The adapter flavor to find models for
   * @return An array of model constructors
   */
  static models<M extends Model>(flavour: string): ModelConstructor<M>[] {
    try {
      return Metadata.flavouredAs(flavour).filter(
        (Model as any).isModel
      ) as ModelConstructor<M>[];
    } catch (e: any) {
      throw new InternalError(e);
    }
  }

  static decoration(): void {}

  protected proxies?: Record<string, typeof this>;

  /**
   * @description Returns the client instance for the adapter
   * @summary This method should be overridden by subclasses to return the client instance for the adapter.
   * @template CON - The type of the client instance
   * @return {CON} The client instance for the adapter
   * @abstract
   * @function getClient
   * @memberOf module:core
   * @instance
   * @protected
   */
  protected abstract getClient(): CONN;

  @final()
  get client(): CONN {
    if (!this._client) {
      this._client = this.getClient();
    }
    return this._client;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for(config: Partial<CONF>, ...args: any[]): this {
    if (!this.proxies) this.proxies = {};
    const key = `${this.alias} - ${hashObj(config)}`;
    if (key in this.proxies) return this.proxies[key] as typeof this;

    let client: any;
    const proxy = new Proxy(this, {
      get: (target: typeof this, p: string | symbol, receiver: any) => {
        if (p === "_config") {
          const originalConf: CONF = Reflect.get(target, p, receiver);
          return Object.assign({}, originalConf, config);
        }
        if (p === "_client") {
          return client;
        }
        return Reflect.get(target, p, receiver);
      },
      set: (target: any, p: string | symbol, value: any, receiver: any) => {
        if (p === "_client") {
          client = value;
          return true;
        }
        return Reflect.set(target, p, value, receiver);
      },
    });
    this.proxies[key] = proxy;
    return proxy as typeof this;
  }

  migrations() {
    return Metadata.migrationsFor(this);
  }

  protected async getQueryRunner(): Promise<CONN> {
    return this as unknown as CONN;
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<
    ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ):
    | Promise<
        ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
      >
    | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false> {
    return super.logCtx(args, operation, allowCreate as any, overrides);
  }
}
