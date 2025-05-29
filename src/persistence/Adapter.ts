import {
  BaseError,
  DBKeys,
  InternalError,
  NotFoundError,
  Context,
  OperationKeys,
  RepositoryFlags,
  DefaultRepositoryFlags,
  Contextual,
  BulkCrudOperationKeys,
  modelToTransient,
} from "@decaf-ts/db-decorators";
import { type Observer } from "../interfaces/Observer";
import {
  type Constructor,
  Decoration,
  DefaultFlavour,
  Model,
  ModelConstructor,
  ModelRegistry,
} from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { RawExecutor } from "../interfaces/RawExecutor";
import { Observable } from "../interfaces/Observable";
import { PersistenceKeys } from "./constants";
import { Repository } from "../repository/Repository";
import { Sequence } from "./Sequence";
import { ErrorParser } from "../interfaces";
import { Statement } from "../query/Statement";
import { Logger, Logging } from "@decaf-ts/logging";
import { final } from "../utils";
import { Dispatch } from "./Dispatch";
import { type EventIds, type ObserverFilter } from "./types";
import { ObserverHandler } from "./ObserverHandler";

Decoration.setFlavourResolver((obj: object) => {
  try {
    return (
      Adapter.flavourOf(Model.isModel(obj) ? obj.constructor : (obj as any)) ||
      DefaultFlavour
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    return DefaultFlavour;
  }
});

/**
 * @description Abstract base class for database adapters
 * @summary Provides the foundation for all database adapters in the persistence layer. This class
 * implements several interfaces to provide a consistent API for database operations, observer
 * pattern support, and error handling. It manages adapter registration, CRUD operations, and
 * observer notifications.
 * @template Y - The underlying database driver type
 * @template Q - The query object type used by the adapter
 * @template F - The repository flags type
 * @template C - The context type
 * @param {Y} _native - The underlying database driver instance
 * @param {string} flavour - The identifier for this adapter type
 * @param {string} [_alias] - Optional alternative name for this adapter
 * @class Adapter
 * @example
 * ```typescript
 * // Implementing a concrete adapter
 * class PostgresAdapter extends Adapter<pg.Client, pg.Query, PostgresFlags, PostgresContext> {
 *   constructor(client: pg.Client) {
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
    Y,
    Q,
    F extends RepositoryFlags,
    C extends Context<F>,
  >
  implements RawExecutor<Q>, Contextual<F, C>, Observable, Observer, ErrorParser
{
  private static _current: Adapter<any, any, any, any>;
  private static _cache: Record<string, Adapter<any, any, any, any>> = {};

  private logger!: Logger;

  protected dispatch?: Dispatch<Y>;

  protected readonly observerHandler?: ObserverHandler;

  /**
   * @description Logger accessor
   * @summary Gets or initializes the logger for this adapter instance
   * @return {Logger} The logger instance
   */
  protected get log() {
    if (!this.logger) this.logger = Logging.for(this as any);
    return this.logger;
  }

  /**
   * @description Gets the native database driver
   * @summary Provides access to the underlying database driver instance
   * @return {Y} The native database driver
   */
  get native() {
    return this._native;
  }

  /**
   * @description Gets the adapter's alias or flavor name
   * @summary Returns the alias if set, otherwise returns the flavor name
   * @return {string} The adapter's identifier
   */
  get alias() {
    return this._alias || this.flavour;
  }

  /**
   * @description Gets the repository constructor for this adapter
   * @summary Returns the constructor for creating repositories that work with this adapter
   * @template M - The model type
   * @return {Constructor<Repository<M, Q, Adapter<Y, Q, F, C>, F, C>>} The repository constructor
   */
  repository<M extends Model>(): Constructor<
    Repository<M, Q, Adapter<Y, Q, F, C>, F, C>
  > {
    return Repository;
  }

  /**
   * @description Creates a new adapter instance
   * @summary Initializes the adapter with the native driver and registers it in the adapter cache
   */
  protected constructor(
    private readonly _native: Y,
    readonly flavour: string,
    private readonly _alias?: string
  ) {
    if (this.flavour in Adapter._cache)
      throw new InternalError(
        `${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} already registered`
      );
    Adapter._cache[this.alias] = this;
    this.log.info(
      `Created ${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} persistence adapter`
    );
    if (!Adapter._current) {
      this.log.verbose(`Defined ${this.alias} persistence adapter as current`);
      Adapter._current = this;
    }
  }

  /**
   * @description Creates a new statement builder for a model
   * @summary Returns a statement builder that can be used to construct queries for a specific model
   * @template M - The model type
   * @return {Statement} A statement builder for the model
   */
  abstract Statement<M extends Model>(): Statement<Q, M, any>;

  /**
   * @description Creates a new dispatch instance
   * @summary Factory method that creates a dispatch instance for this adapter
   * @return {Dispatch<Y>} A new dispatch instance
   */
  protected Dispatch(): Dispatch<Y> {
    return new Dispatch();
  }

  /**
   * @description Creates a new observer handler
   * @summary Factory method that creates an observer handler for this adapter
   * @return {ObserverHandler} A new observer handler instance
   */
  protected ObserverHandler() {
    return new ObserverHandler();
  }

  /**
   * @description Checks if an attribute name is reserved
   * @summary Determines if a given attribute name is reserved and cannot be used as a column name
   * @param {string} attr - The attribute name to check
   * @return {boolean} True if the attribute is reserved, false otherwise
   */
  protected isReserved(attr: string) {
    return !attr;
  }

  /**
   * @description Parses a database error into a standardized error
   * @summary Converts database-specific errors into standardized application errors
   * @param {Error} err - The original database error
   * @return {BaseError} A standardized error
   */
  abstract parseError(err: Error): BaseError;

  /**
   * @description Initializes the adapter
   * @summary Performs any necessary setup for the adapter, such as establishing connections
   * @param {...any[]} args - Initialization arguments
   * @return {Promise<void>} A promise that resolves when initialization is complete
   */
  abstract initialize(...args: any[]): Promise<void>;

  /**
   * @description Creates a sequence generator
   * @summary Factory method that creates a sequence generator for generating sequential values
   * @param {SequenceOptions} options - Configuration options for the sequence
   * @return {Promise<Sequence>} A promise that resolves to a new sequence instance
   */
  abstract Sequence(options: SequenceOptions): Promise<Sequence>;

  /**
   * @description Creates repository flags for an operation
   * @summary Generates a set of flags that describe a database operation, combining default flags with overrides
   * @template F - The Repository Flags type
   * @template M - The model type
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<F>} flags - Custom flag overrides
   * @param {...any[]} args - Additional arguments
   * @return {F} The complete set of flags
   */
  protected flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<F>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): F {
    return Object.assign({}, DefaultRepositoryFlags, flags, {
      affectedTables: Repository.table(model),
      writeOperation: operation !== OperationKeys.READ,
      timestamp: new Date(),
      operation: operation,
    }) as F;
  }

  /**
   * @description The context constructor for this adapter
   * @summary Reference to the context class constructor used by this adapter
   */
  protected Context: Constructor<C> = Context<F> as any;

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
  async context<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE,
    overrides: Partial<F>,
    model: Constructor<M>,
    ...args: any[]
  ): Promise<C> {
    this.log
      .for(this.context)
      .debug(
        `Creating new context for ${operation} operation on ${model.name} model with flags: ${JSON.stringify(overrides)}`
      );
    return new this.Context(
      this.flags(operation, model, overrides, ...args)
    ) as unknown as C;
  }

  /**
   * @description Prepares a model for persistence
   * @summary Converts a model instance into a format suitable for database storage,
   * handling column mapping and separating transient properties
   * @template M - The model type
   * @param {M} model - The model instance to prepare
   * @param {keyof M} pk - The primary key property name
   * @return {{ record: Record<string, any>; id: string; transient?: Record<string, any> }} The prepared data
   */
  prepare<M extends Model>(
    model: M,
    pk: keyof M
  ): {
    record: Record<string, any>;
    id: string;
    transient?: Record<string, any>;
  } {
    const log = this.log.for(this.prepare);
    log.silly(`Preparing model ${model.constructor.name} before persisting`);
    const split = modelToTransient(model);
    const result = Object.entries(split.model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (typeof val === "undefined") return accum;
        const mappedProp = Repository.column(model, key);
        if (this.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
    if ((model as any)[PersistenceKeys.METADATA]) {
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    return {
      record: result,
      id: model[pk] as string,
      transient: split.transient,
    };
  }

  /**
   * @description Converts database data back into a model instance
   * @summary Reconstructs a model instance from database data, handling column mapping
   * and reattaching transient properties
   * @template M - The model type
   * @param {Record<string, any>} obj - The database record
   * @param {string|Constructor<M>} clazz - The model class or name
   * @param {keyof M} pk - The primary key property name
   * @param {string|number|bigint} id - The primary key value
   * @param {Record<string, any>} [transient] - Transient properties to reattach
   * @return {M} The reconstructed model instance
   */
  revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: keyof M,
    id: string | number | bigint,
    transient?: Record<string, any>
  ): M {
    const log = this.log.for(this.revert);
    const ob: Record<string, any> = {};
    ob[pk as string] = id;
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as M;
    log.silly(`Rebuilding model ${m.constructor.name} id ${id}`);
    const metadata = obj[PersistenceKeys.METADATA];
    const result = Object.keys(m).reduce((accum: M, key) => {
      if (key === pk) return accum;
      (accum as Record<string, any>)[key] = obj[Repository.column(accum, key)];
      return accum;
    }, m);

    if (transient) {
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
      log.silly(
        `Passing along ${this.flavour} persistence metadata for ${m.constructor.name} id ${id}: ${metadata}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: metadata,
      });
    }

    return result;
  }

  /**
   * @description Creates a new record in the database
   * @summary Inserts a new record with the given ID and data into the specified table
   * @param {string} tableName - The name of the table to insert into
   * @param {string|number} id - The identifier for the new record
   * @param {Record<string, any>} model - The data to insert
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>>} A promise that resolves to the created record
   */
  abstract create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  /**
   * @description Creates multiple records in the database
   * @summary Inserts multiple records with the given IDs and data into the specified table
   * @param {string} tableName - The name of the table to insert into
   * @param {(string|number)[]} id - The identifiers for the new records
   * @param {Record<string, any>[]} model - The data to insert for each record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>[]>} A promise that resolves to an array of created records
   */
  async createAll(
    tableName: string,
    id: (string | number)[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const log = this.log.for(this.createAll);
    log.verbose(`Creating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(
      id.map((i, count) => this.create(tableName, i, model[count], ...args))
    );
  }

  /**
   * @description Retrieves a record from the database
   * @summary Fetches a record with the given ID from the specified table
   * @param {string} tableName - The name of the table to read from
   * @param {string|number|bigint} id - The identifier of the record to retrieve
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>>} A promise that resolves to the retrieved record
   */
  abstract read(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  /**
   * @description Retrieves multiple records from the database
   * @summary Fetches multiple records with the given IDs from the specified table
   * @param {string} tableName - The name of the table to read from
   * @param {(string|number|bigint)[]} id - The identifiers of the records to retrieve
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>[]>} A promise that resolves to an array of retrieved records
   */
  async readAll(
    tableName: string,
    id: (string | number | bigint)[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.readAll);
    log.verbose(`Reading ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(id.map((i) => this.read(tableName, i, ...args)));
  }

  /**
   * @description Updates a record in the database
   * @summary Modifies an existing record with the given ID in the specified table
   * @param {string} tableName - The name of the table to update
   * @param {string|number} id - The identifier of the record to update
   * @param {Record<string, any>} model - The new data for the record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>>} A promise that resolves to the updated record
   */
  abstract update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  /**
   * @description Updates multiple records in the database
   * @summary Modifies multiple existing records with the given IDs in the specified table
   * @param {string} tableName - The name of the table to update
   * @param {string[]|number[]} id - The identifiers of the records to update
   * @param {Record<string, any>[]} model - The new data for each record
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>[]>} A promise that resolves to an array of updated records
   */
  async updateAll(
    tableName: string,
    id: string[] | number[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const log = this.log.for(this.updateAll);
    log.verbose(`Updating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(
      id.map((i, count) => this.update(tableName, i, model[count], ...args))
    );
  }

  /**
   * @description Deletes a record from the database
   * @summary Removes a record with the given ID from the specified table
   * @param {string} tableName - The name of the table to delete from
   * @param {string|number|bigint} id - The identifier of the record to delete
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>>} A promise that resolves to the deleted record
   */
  abstract delete(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  /**
   * @description Deletes multiple records from the database
   * @summary Removes multiple records with the given IDs from the specified table
   * @param {string} tableName - The name of the table to delete from
   * @param {(string|number|bigint)[]} id - The identifiers of the records to delete
   * @param {...any[]} args - Additional arguments specific to the adapter implementation
   * @return {Promise<Record<string, any>[]>} A promise that resolves to an array of deleted records
   */
  async deleteAll(
    tableName: string,
    id: (string | number | bigint)[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.createAll);
    log.verbose(`Deleting ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(id.map((i) => this.delete(tableName, i, ...args)));
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
  abstract raw<R>(rawInput: Q, ...args: any[]): Promise<R>;

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
    this.log
      .for(this.observe)
      .verbose(`Registering new observer ${observer.toString()}`);
    if (!this.dispatch) {
      this.log.for(this.observe).info(`Creating dispatch for ${this.alias}`);
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
      .verbose(`Observer ${observer.toString()} removed`);
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
  async updateObservers(
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: any[]
  ): Promise<void> {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    const log = this.log.for(this.updateObservers);
    log.verbose(
      `Updating ${this.observerHandler.count()} observers for adapter ${this.alias}`
    );
    await this.observerHandler.updateObservers(
      this.log,
      table,
      event,
      id,
      ...args
    );
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
  async refresh(
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: any[]
  ) {
    return this.updateObservers(table, event, id, ...args);
  }

  /**
   * @description Gets a string representation of the adapter
   * @summary Returns a human-readable string identifying this adapter
   * @return {string} A string representation of the adapter
   */
  toString() {
    return `${this.flavour} persistence Adapter`;
  }

  /**
   * @description Gets the adapter flavor associated with a model
   * @summary Retrieves the adapter flavor that should be used for a specific model class
   * @template M - The model type
   * @param {Constructor<M>} model - The model constructor
   * @return {string} The adapter flavor name
   */
  static flavourOf<M extends Model>(model: Constructor<M>): string {
    return (
      Reflect.getMetadata(this.key(PersistenceKeys.ADAPTER), model) ||
      this.current.flavour
    );
  }

  /**
   * @description Gets the current default adapter
   * @summary Retrieves the adapter that is currently set as the default for operations
   * @return {Adapter<any, any, any, any>} The current adapter
   */
  static get current() {
    if (!Adapter._current)
      throw new InternalError(
        `No persistence flavour set. Please initialize your adapter`
      );
    return Adapter._current;
  }

  /**
   * @description Gets an adapter by flavor
   * @summary Retrieves a registered adapter by its flavor name
   * @template Y - The database driver type
   * @template Q - The query type
   * @template C - The context type
   * @template F - The repository flags type
   * @param {string} flavour - The flavor name of the adapter to retrieve
   * @return {Adapter<Y, Q, F, C> | undefined} The adapter instance or undefined if not found
   */
  static get<Y, Q, C extends Context<F>, F extends RepositoryFlags>(
    flavour: any
  ): Adapter<Y, Q, F, C> | undefined {
    if (flavour in this._cache) return this._cache[flavour];
    throw new InternalError(`No Adapter registered under ${flavour}.`);
  }

  /**
   * @description Sets the current default adapter
   * @summary Changes which adapter is used as the default for operations
   * @param {string} flavour - The flavor name of the adapter to set as current
   * @return {void}
   */
  static setCurrent(flavour: string) {
    const adapter = Adapter.get(flavour);
    if (!adapter)
      throw new NotFoundError(`No persistence flavour ${flavour} registered`);
    this._current = adapter;
  }

  /**
   * @description Creates a metadata key
   * @summary Generates a standardized metadata key for persistence-related metadata
   * @param {string} key - The base key name
   * @return {string} The formatted metadata key
   */
  static key(key: string) {
    return Repository.key(key);
  }

  /**
   * @description Gets all models associated with an adapter flavor
   * @summary Retrieves all model constructors that are configured to use a specific adapter flavor
   * @template M - The model type
   * @param {string} flavour - The adapter flavor to find models for
   * @return {ModelConstructor<any>[]} An array of model constructors
   */
  static models<M extends Model>(flavour: string) {
    try {
      const registry = (Model as any).getRegistry() as ModelRegistry<any>;
      const cache = (
        registry as unknown as { cache: Record<string, ModelConstructor<any>> }
      ).cache;
      const managedModels: ModelConstructor<any>[] = Object.values(cache)
        .map((m: ModelConstructor<M>) => {
          let f = Reflect.getMetadata(
            Adapter.key(PersistenceKeys.ADAPTER),
            m as ModelConstructor<any>
          );
          if (f && f === flavour) return m;
          if (!f) {
            const repo = Reflect.getMetadata(
              Repository.key(DBKeys.REPOSITORY),
              m as ModelConstructor<any>
            );
            if (!repo) return;
            const repository = Repository.forModel(m);

            f = Reflect.getMetadata(
              Adapter.key(PersistenceKeys.ADAPTER),
              repository
            );
            return f;
          }
        })
        .filter((m) => !!m);
      return managedModels;
    } catch (e: any) {
      throw new InternalError(e);
    }
  }
}
