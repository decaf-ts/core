import { RamFlags, RawRamQuery, RamStorage, RamRepository } from "./types";
import { RamStatement } from "./RamStatement";
import { RamContext } from "./RamContext";
import { Repository } from "../repository/Repository";
import { Adapter, PersistenceKeys, Sequence } from "../persistence";
import { SequenceOptions } from "../interfaces";
import { Lock } from "@decaf-ts/transactional-decorators";
import {
  Constructor,
  Decoration,
  Model,
  propMetadata,
} from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  findPrimaryKey,
  InternalError,
  NotFoundError,
  onCreate,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { RamSequence } from "./RamSequence";
import { createdByOnRamCreateUpdate } from "./handlers";
import { RamFlavour } from "./constants";

/**
 * @description In-memory adapter for data persistence
 * @summary The RamAdapter provides an in-memory implementation of the persistence layer.
 * It stores data in JavaScript Maps and provides CRUD operations and query capabilities.
 * This adapter is useful for testing, prototyping, and applications that don't require
 * persistent storage across application restarts.
 * @class RamAdapter
 * @category Ram
 * @example
 * ```typescript
 * // Create a new RAM adapter
 * const adapter = new RamAdapter('myRamAdapter');
 *
 * // Create a repository for a model
 * const userRepo = new (adapter.repository<User>())(User, adapter);
 *
 * // Perform CRUD operations
 * const user = new User({ name: 'John', email: 'john@example.com' });
 * await userRepo.create(user);
 * const retrievedUser = await userRepo.findById(user.id);
 * ```
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Repository
 *   participant RamAdapter
 *   participant Storage as In-Memory Storage
 *
 *   Client->>Repository: create(model)
 *   Repository->>RamAdapter: create(tableName, id, model)
 *   RamAdapter->>RamAdapter: lock.acquire()
 *   RamAdapter->>Storage: set(id, model)
 *   RamAdapter->>RamAdapter: lock.release()
 *   RamAdapter-->>Repository: model
 *   Repository-->>Client: model
 *
 *   Client->>Repository: findById(id)
 *   Repository->>RamAdapter: read(tableName, id)
 *   RamAdapter->>Storage: get(id)
 *   Storage-->>RamAdapter: model
 *   RamAdapter-->>Repository: model
 *   Repository-->>Client: model
 */
export class RamAdapter extends Adapter<
  RamStorage,
  RawRamQuery<any>,
  RamFlags,
  RamContext
> {
  constructor(alias?: string) {
    super(new Map<string, Map<string, any>>(), RamFlavour, alias);
  }

  /**
   * @description Gets the repository constructor for a model
   * @summary Returns a constructor for creating repositories that work with the specified model type.
   * This method overrides the base implementation to provide RAM-specific repository functionality.
   * @template M - The model type for the repository
   * @return {Constructor<RamRepository<M>>} A constructor for creating RAM repositories
   */
  override repository<M extends Model>(): Constructor<RamRepository<M>> {
    return super.repository<M>() as Constructor<RamRepository<M>>;
  }

  /**
   * @description Creates operation flags with UUID
   * @summary Extends the base flags with a UUID for user identification.
   * This method ensures that all operations have a unique identifier for tracking purposes.
   * @template M - The model type for the operation
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<RamFlags>} flags - Partial flags to be extended
   * @return {RamFlags} Complete flags with UUID
   */
  override flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<RamFlags>
  ): RamFlags {
    return Object.assign(super.flags(operation, model, flags), {
      UUID: crypto.randomUUID(),
    }) as RamFlags;
  }

  override Context = RamContext;

  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock = new Lock();

  /**
   * @description Initializes the RAM adapter
   * @summary A no-op initialization method for the RAM adapter.
   * Since RAM adapter doesn't require any setup, this method simply resolves immediately.
   * @param {...any[]} args - Initialization arguments (unused)
   * @return {Promise<void>} A promise that resolves when initialization is complete
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    return Promise.resolve(undefined);
  }

  /**
   * @description Indexes models in the RAM adapter
   * @summary A no-op indexing method for the RAM adapter.
   * Since RAM adapter doesn't require explicit indexing, this method simply resolves immediately.
   * @param models - Models to be indexed (unused)
   * @return {Promise<any>} A promise that resolves when indexing is complete
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    pk: keyof M
  ): { record: Record<string, any>; id: string } {
    const prepared = super.prepare(model, pk);
    delete prepared.record[pk as string];
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
    clazz: string | Constructor<M>,
    pk: keyof M,
    id: string | number
  ): M {
    const res = super.revert(obj, clazz, pk, id);
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
  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!this.native.has(tableName)) this.native.set(tableName, new Map());
    if (this.native.get(tableName) && this.native.get(tableName)?.has(id))
      throw new ConflictError(
        `Record with id ${id} already exists in table ${tableName}`
      );
    this.native.get(tableName)?.set(id, model);
    this.lock.release();
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
  async read(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    if (!this.native.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.native.get(tableName)?.has(id))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    return this.native.get(tableName)?.get(id);
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
  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!this.native.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.native.get(tableName)?.has(id))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    this.native.get(tableName)?.set(id, model);
    this.lock.release();
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
  async delete(
    tableName: string,
    id: string | number
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!this.native.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.native.get(tableName)?.has(id))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    const natived = this.native.get(tableName)?.get(id);
    this.native.get(tableName)?.delete(id);
    this.lock.release();
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
    const table = Repository.table(from);
    if (!this.native.has(table)) this.native.set(table, new Map());
    return this.native.get(table);
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
  async raw<R>(rawInput: RawRamQuery<any>): Promise<R> {
    const { where, sort, limit, skip, from } = rawInput;
    let { select } = rawInput;
    const collection = this.tableFor(from);
    if (!collection)
      throw new InternalError(`Table ${from} not found in RamAdapter`);
    const { id, props } = findPrimaryKey(new from());

    let result: any[] = Array.from(collection.entries()).map(([pk, r]) =>
      this.revert(
        r,
        from,
        id as any,
        Sequence.parseValue(props.type as any, pk as string) as string
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
  Statement<M extends Model>(): RamStatement<M, any> {
    return new RamStatement<M, any>(this as any);
  }

  /**
   * @description Creates a new sequence for generating sequential IDs
   * @summary Factory method that creates a new RamSequence instance for ID generation.
   * This method provides a way to create auto-incrementing sequences for entity IDs.
   * @param {SequenceOptions} options - Configuration options for the sequence
   * @return {Promise<Sequence>} A promise that resolves to the new sequence instance
   */
  async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new RamSequence(options, this);
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
  static decoration() {
    const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
    const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);
    Decoration.flavouredAs(RamFlavour)
      .for(createdByKey)
      .define(
        onCreate(createdByOnRamCreateUpdate),
        propMetadata(createdByKey, {})
      )
      .apply();
    Decoration.flavouredAs(RamFlavour)
      .for(updatedByKey)
      .define(
        onCreate(createdByOnRamCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();
  }
}

RamAdapter.decoration();
