/* eslint-disable @typescript-eslint/no-unused-vars */
import { Lock } from "@decaf-ts/transactional-decorators";
import { hashObj, Model } from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  OperationKeys,
  InternalError,
  NotFoundError,
  onCreate,
  onCreateUpdate,
  DBKeys,
  PrimaryKeyType,
  ContextOfRepository,
  Context,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import {
  Constructor,
  Decoration,
  Metadata,
  propMetadata,
} from "@decaf-ts/decoration";
import {
  RamConfig,
  RamContext,
  RamFlags,
  RamStatement,
  RamStorage,
  RawRamQuery,
} from "../../src/ram/index";
import {
  ContextualArgs,
  Dispatch,
  FlagsOf,
  PersistenceKeys,
  PreparedStatement,
  RelationsMetadata,
  Repo,
  Repository,
  Sequence,
  UnsupportedError,
  Paginator,
} from "../../src/index";
import { Adapter } from "../../src/persistence/Adapter";

/**
 * @description Sets the created by field on a model during RAM create/update operations
 * @summary Automatically populates a model field with the UUID from the context during create or update operations.
 * This function is designed to be used as a handler for RAM operations to track entity creation.
 * @template M - Type of the model being created/updated
 * @template R - Type of the repository handling the model
 * @template V - Type of the relations metadata
 * @template F - Type of the RAM flags
 * @template C - Type of the context
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The operation context containing user identification
 * @param {V} data - The relations metadata
 * @param key - The property key to set with the UUID
 * @param {M} model - The model instance being created/updated
 * @return {Promise<void>} A promise that resolves when the field has been set
 * @function createdByOnRamCreateUpdate
 * @memberOf module:core
 * @category Ram
 */
export async function createdByOnDummyCreateUpdate<
  M extends Model,
  R extends Repo<M>,
  V extends RelationsMetadata,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const uuid: string = "DUMMY_USER_ID";
  if (!uuid)
    throw new UnsupportedError(
      "This adapter does not support user identification"
    );
  model[key] = uuid as M[keyof M];
}

export type TransactionalFlags = RepositoryFlags & {
  lock: Lock;
  isLocked: boolean;
};

export class TransactionalContext<
  F extends TransactionalFlags = TransactionalFlags,
> extends Context<F> {
  constructor() {
    super();
  }

  async acquire() {
    if (this.isLocked) return;
    await this.lock.acquire();
    this.cache["isLocked"] = true;
  }

  release() {
    this.lock.release();
    this.cache["isLocked"] = false;
  }

  protected get lock(): Lock {
    return this.get("lock");
  }

  protected get isLocked(): boolean {
    return this.get("isLocked");
  }
}

export class DummyAdapter extends Adapter<
  RamConfig,
  RamStorage,
  RawRamQuery<any>,
  RamContext
> {
  constructor(conf: RamConfig = {} as any, alias?: string) {
    super(conf, "dummy", alias);
  }

  Paginator<M>(
    query: PreparedStatement<M> | RawRamQuery<any>,
    size: number,
    clazz: Constructor<M>
  ): Paginator<M, any, RawRamQuery<any>> {
    throw new Error("not implemented");
  }

  /**
   * @description Gets the repository constructor for a model
   * @summary Returns a constructor for creating repositories that work with the specified model type.
   * This method overrides the base implementation to provide RAM-specific repository functionality.
   * @template M - The model type for the repository
   * @return {Constructor<RamRepository<M>>} A constructor for creating RAM repositories
   */
  // @ts-expect-error testitng
  override repository(): Constructor<
    Repository<
      any,
      Adapter<RamConfig, RamStorage, RawRamQuery<any>, RamContext>
    >
  > {
    return super.repository() as unknown as Constructor<
      Repository<
        any,
        Adapter<RamConfig, RamStorage, RawRamQuery<any>, RamContext>
      >
    >;
  }

  /**
   * @description Creates operation flags with UUID
   * @summary Extends the base flags with a UUID for user identification.
   * This method ensures that all operations have a unique identifier for tracking purposes.
   * @template M - The model type for the operation
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<RamFlags>} flags - Partial flags to be extended
   * @return {Promise<RamFlags>} Complete flags with UUID
   */
  override async flags<M extends Model<boolean>>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<RamFlags>
  ): Promise<RamFlags> {
    return Object.assign(await super.flags(operation, model, flags), {
      UUID: this.config.user || "" + Date.now(),
      lock: this.lock,
      isLocked: false,
    }) as RamFlags;
  }

  protected override Dispatch(): Dispatch<any> {
    return super.Dispatch();
  }

  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock = new Lock();

  protected readonly Context: Constructor<TransactionalContext> =
    TransactionalContext;

  async context<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FlagsOf<TransactionalContext>>,
    model: Constructor<M> | Constructor<M>[],
    ...args
  ): Promise<TransactionalContext> {
    const ctx = (await super.context(
      operation,
      overrides,
      model,
      ...args
    )) as TransactionalContext;
    return ctx;
  }

  /**
   * @description Indexes models in the RAM adapter
   * @summary A no-op indexing method for the RAM adapter.
   * Since RAM adapter doesn't require explicit indexing, this method simply resolves immediately.
   * @param models - Models to be indexed (unused)
   * @return {Promise<any>} A promise that resolves when indexing is complete
   */

  async index(...models: Record<string, any>[]): Promise<any> {
    return Promise.resolve(undefined);
  }

  /**
   * @description Prepares a model for storage
   * @summary Converts a model instance to a format suitable for storage in the RAM adapter.
   * This method extracts the primary key and creates a record without the primary key field.
   * @template M - The model type being prepared
   * @param {M} model - The model instance to prepare
   * @param pk - The primary key property name
   * @return Object containing the record and ID
   */
  override prepare<M extends Model>(
    model: M,
    ...args: [...any[], RamContext]
  ): { record: Record<string, any>; id: string } {
    const { ctx } = this.logCtx(args, this.create);
    const prepared = super.prepare(model, ...args, ctx);
    return prepared;
  }

  /**
   * @description Converts a stored record back to a model instance
   * @summary Reconstructs a model instance from a stored record by adding back the primary key.
   * This method is the inverse of the prepare method.
   * @template M - The model type to revert to
   * @param {Record<string, any>} obj - The stored record
   * @param {string | Constructor<M>} clazz - The model class or name
   * @param pk - The primary key property name
   * @param {string | number} id - The primary key value
   * @return {M} The reconstructed model instance
   */
  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    transient?: Record<string, any>,
    ...args: [...any[], RamContext]
  ): M {
    const { ctxArgs } = this.logCtx(args, this.revert);
    const res = super.revert(obj, clazz, id, transient, ...ctxArgs);
    return res;
  }

  /**
   * @description Creates a new record in the in-memory storage
   * @summary Stores a new record in the specified table with the given ID.
   * This method acquires a lock to ensure thread safety, creates the table if it doesn't exist,
   * checks for conflicts, and stores the model.
   * @param {string} tableName - The name of the table to store the record in
   * @param {string | number} id - The unique identifier for the record
   * @param {Record<string, any>} model - The record data to store
   * @return {Promise<Record<string, any>>} A promise that resolves to the stored record
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamAdapter
   *   participant Storage as In-Memory Storage
   *
   *   Caller->>RamAdapter: create(tableName, id, model)
   *   RamAdapter->>RamAdapter: lock.acquire()
   *   RamAdapter->>Storage: has(tableName)
   *   alt Table doesn't exist
   *     RamAdapter->>Storage: set(tableName, new Map())
   *   end
   *   RamAdapter->>Storage: has(id)
   *   alt Record exists
   *     RamAdapter-->>Caller: throw ConflictError
   *   end
   *   RamAdapter->>Storage: set(id, model)
   *   RamAdapter->>RamAdapter: lock.release()
   *   RamAdapter-->>Caller: model
   */
  async create<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,

    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    const tableName = Model.tableName(clazz);
    if (!this.client.has(tableName)) this.client.set(tableName, new Map());
    if (
      this.client.get(tableName) &&
      this.client.get(tableName)?.has(id as string)
    )
      throw new ConflictError(
        `Record with id ${id} already exists in table ${tableName}`
      );
    this.client.get(tableName)?.set(id as string, model);
    return model;
  }

  /**
   * @description Retrieves a record from in-memory storage
   * @summary Fetches a record with the specified ID from the given table.
   * This method checks if the table and record exist and throws appropriate errors if not.
   * @param {string} tableName - The name of the table to retrieve from
   * @param {string | number} id - The unique identifier of the record to retrieve
   * @return {Promise<Record<string, any>>} A promise that resolves to the retrieved record
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamAdapter
   *   participant Storage as In-Memory Storage
   *
   *   Caller->>RamAdapter: read(tableName, id)
   *   RamAdapter->>Storage: has(tableName)
   *   alt Table doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: has(id)
   *   alt Record doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: get(id)
   *   Storage-->>RamAdapter: record
   *   RamAdapter-->>Caller: record
   */
  async read<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.create);
    const tableName = Model.tableName(clazz);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as string))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    return this.client.get(tableName)?.get(id as string);
  }

  /**
   * @description Updates an existing record in the in-memory storage
   * @summary Updates a record with the specified ID in the given table.
   * This method acquires a lock to ensure thread safety, checks if the table and record exist,
   * and updates the record with the new data.
   * @param {string} tableName - The name of the table containing the record
   * @param {string | number} id - The unique identifier of the record to update
   * @param {Record<string, any>} model - The new record data
   * @return {Promise<Record<string, any>>} A promise that resolves to the updated record
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamAdapter
   *   participant Storage as In-Memory Storage
   *
   *   Caller->>RamAdapter: update(tableName, id, model)
   *   RamAdapter->>RamAdapter: lock.acquire()
   *   RamAdapter->>Storage: has(tableName)
   *   alt Table doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: has(id)
   *   alt Record doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: set(id, model)
   *   RamAdapter->>RamAdapter: lock.release()
   *   RamAdapter-->>Caller: model
   */
  async update<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.create);
    const tableName = Model.tableName(clazz);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as string))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    this.client.get(tableName)?.set(id as string, model);
    return model;
  }

  /**
   * @description Deletes a record from the in-memory storage
   * @summary Removes a record with the specified ID from the given table.
   * This method acquires a lock to ensure thread safety, checks if the table and record exist,
   * retrieves the record before deletion, and then removes it from storage.
   * @param {string} tableName - The name of the table containing the record
   * @param {string | number} id - The unique identifier of the record to delete
   * @return {Promise<Record<string, any>>} A promise that resolves to the deleted record
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamAdapter
   *   participant Storage as In-Memory Storage
   *
   *   Caller->>RamAdapter: delete(tableName, id)
   *   RamAdapter->>RamAdapter: lock.acquire()
   *   RamAdapter->>Storage: has(tableName)
   *   alt Table doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: has(id)
   *   alt Record doesn't exist
   *     RamAdapter-->>Caller: throw NotFoundError
   *   end
   *   RamAdapter->>Storage: get(id)
   *   Storage-->>RamAdapter: record
   *   RamAdapter->>Storage: delete(id)
   *   RamAdapter->>RamAdapter: lock.release()
   *   RamAdapter-->>Caller: record
   */
  async delete<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    const { log, ctx } = this.logCtx(args, this.create);
    const tableName = Model.tableName(clazz);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as string))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    const natived = this.client.get(tableName)?.get(id as string);
    this.client.get(tableName)?.delete(id as string);
    return natived;
  }

  /**
   * @description Gets or creates a table in the in-memory storage
   * @summary Retrieves the Map representing a table for a given model or table name.
   * If the table doesn't exist, it creates a new one. This is a helper method used
   * by other methods to access the correct storage location.
   * @template M - The model type for the table
   * @param {string | Constructor<M>} from - The model class or table name
   * @return {Map<string | number, any> | undefined} The table Map or undefined
   */
  protected tableFor<M extends Model>(from: string | Constructor<M>) {
    if (typeof from === "string") from = Model.get(from) as Constructor<M>;
    const table = Model.tableName(from);
    if (!this.client.has(table)) this.client.set(table, new Map());
    return this.client.get(table);
  }

  /**
   * @description Executes a raw query against the in-memory storage
   * @summary Performs a query operation on the in-memory data store using the provided query specification.
   * This method supports filtering, sorting, pagination, and field selection.
   * @template R - The return type of the query
   * @param {RawRamQuery<any>} rawInput - The query specification
   * @return {Promise<R>} A promise that resolves to the query results
   * @mermaid
   * sequenceDiagram
   *   participant Caller
   *   participant RamAdapter
   *   participant Storage as In-Memory Storage
   *
   *   Caller->>RamAdapter: raw(rawInput)
   *   RamAdapter->>RamAdapter: tableFor(from)
   *   alt Table doesn't exist
   *     RamAdapter-->>Caller: throw InternalError
   *   end
   *   RamAdapter->>RamAdapter: findPrimaryKey(new from())
   *   RamAdapter->>Storage: entries()
   *   Storage-->>RamAdapter: entries
   *   loop For each entry
   *     RamAdapter->>RamAdapter: revert(r, from, id, pk)
   *   end
   *   alt Where condition exists
   *     RamAdapter->>RamAdapter: result.filter(where)
   *   end
   *   alt Sort condition exists
   *     RamAdapter->>RamAdapter: result.sort(sort)
   *   end
   *   alt Skip specified
   *     RamAdapter->>RamAdapter: result.slice(skip)
   *   end
   *   alt Limit specified
   *     RamAdapter->>RamAdapter: result.slice(0, limit)
   *   end
   *   alt Select fields specified
   *     loop For each result
   *       RamAdapter->>RamAdapter: Filter to selected fields
   *     end
   *   end
   *   RamAdapter-->>Caller: result
   */
  async raw<R>(
    rawInput: RawRamQuery<any>,
    ...args: ContextualArgs<RamContext>
  ): Promise<R> {
    const ctx = args.pop();
    const { where, sort, limit, skip, from } = rawInput;
    let { select } = rawInput;
    const collection = this.tableFor(from);
    if (!collection)
      throw new InternalError(`Table ${from} not found in RamAdapter`);
    const id = Model.pk(from);
    const props = Metadata.get(from, Metadata.key(DBKeys.ID, id as string));

    let result: any[] = Array.from(collection.entries()).map(([pk, r]) =>
      this.revert(
        r,
        from,
        Sequence.parseValue(props.type as any, pk as string) as string,
        undefined,
        ctx
      )
    );

    result = where ? result.filter(where) : result;

    if (sort) result = result.sort(sort);

    if (skip) result = result.slice(skip);
    if (limit) result = result.slice(0, limit);

    if (select) {
      select = Array.isArray(select) ? select : [select];
      result = result.map((r) =>
        Object.entries(r).reduce((acc: Record<string, any>, [key, val]) => {
          if ((select as string[]).includes(key)) acc[key] = val;
          return acc;
        }, {})
      );
    }

    return result as unknown as R;
  }

  /**
   * @description Parses and converts errors to appropriate types
   * @summary Ensures that errors are of the correct type for consistent error handling.
   * If the error is already a BaseError, it's returned as is; otherwise, it's wrapped in an InternalError.
   * @template V - The expected error type, extending BaseError
   * @param {Error} err - The error to parse
   * @return {V} The parsed error of the expected type
   */
  parseError<V extends BaseError>(err: Error): V {
    if (err instanceof BaseError) return err as V;
    return new InternalError(err) as V;
  }

  /**
   * @description Creates a new statement builder for queries
   * @summary Factory method that creates a new RamStatement instance for building queries.
   * This method allows for fluent query construction against the RAM adapter.
   * @template M - The model type for the statement
   * @return {RamStatement<M, any>} A new statement builder instance
   */
  Statement<M extends Model<boolean>>(): RamStatement<M, any, any> {
    return new RamStatement<M, any, any>(this as any);
  }

  override for(config: Partial<RamConfig>, ...args: any[]): typeof this {
    if (!this.proxies) this.proxies = {};
    const key = `${this.alias} - ${hashObj(config)}`;
    if (key in this.proxies) return this.proxies[key] as typeof this;

    const proxy = new Proxy(this, {
      get: (target: typeof this, p: string | symbol, receiver: any) => {
        if (p === "_config") {
          const originalConf: RamConfig = Reflect.get(target, p, receiver);
          return Object.assign({}, originalConf, config);
        }
        return Reflect.get(target, p, receiver);
      },
    });
    this.proxies[key] = proxy;
    return proxy;
  }

  /**
   * @description Sets up RAM-specific decorations for model properties
   * @summary Configures decorations for createdBy and updatedBy fields in the RAM adapter.
   * This static method is called during initialization to set up handlers that automatically
   * populate these fields with the current user's UUID during create and update operations.
   * @return {void}
   * @mermaid
   * sequenceDiagram
   *   participant RamAdapter
   *   participant Decoration
   *   participant Repository
   *
   *   RamAdapter->>Repository: key(PersistenceKeys.CREATED_BY)
   *   Repository-->>RamAdapter: createdByKey
   *   RamAdapter->>Repository: key(PersistenceKeys.UPDATED_BY)
   *   Repository-->>RamAdapter: updatedByKey
   *
   *   RamAdapter->>Decoration: flavouredAs(RamFlavour)
   *   Decoration-->>RamAdapter: DecoratorBuilder
   *   RamAdapter->>Decoration: for(createdByKey)
   *   RamAdapter->>Decoration: define(onCreate, propMetadata)
   *   RamAdapter->>Decoration: apply()
   *
   *   RamAdapter->>Decoration: flavouredAs(RamFlavour)
   *   Decoration-->>RamAdapter: DecoratorBuilder
   *   RamAdapter->>Decoration: for(updatedByKey)
   *   RamAdapter->>Decoration: define(onCreate, propMetadata)
   *   RamAdapter->>Decoration: apply()
   */
  static override decoration(): void {
    super.decoration();
    const createdByKey = PersistenceKeys.CREATED_BY;
    const updatedByKey = PersistenceKeys.UPDATED_BY;
    Decoration.flavouredAs("dummy")
      .for(createdByKey)
      .define(
        onCreate(createdByOnDummyCreateUpdate),
        propMetadata(createdByKey, {})
      )
      .apply();
    Decoration.flavouredAs("dummy")
      .for(updatedByKey)
      .define(
        onCreateUpdate(createdByOnDummyCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();
  }

  protected override getClient(): RamStorage {
    return new Map();
  }
}
