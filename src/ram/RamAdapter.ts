import {
  RamConfig,
  RamContext,
  RamFlags,
  RamStorage,
  RawRamQuery,
} from "./types";
import { RamStatement } from "./RamStatement";
import { QueryError } from "../query";
import { Repository } from "../repository/Repository";
import { Dispatch } from "../persistence/Dispatch";
import {
  Adapter,
  AdapterFlags,
  PersistenceKeys,
  RawResult,
  Sequence,
} from "../persistence";
import { Lock, MultiLock } from "@decaf-ts/transactional-decorators";
import { hashObj, Model } from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  DBKeys,
  InternalError,
  NotFoundError,
  onCreate,
  onCreateUpdate,
  OperationKeys,
  PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { createdByOnRamCreateUpdate } from "./handlers";
import { RamFlavour } from "./constants";
import type { Constructor } from "@decaf-ts/decoration";
import { Decoration, Metadata, propMetadata } from "@decaf-ts/decoration";
import { RamPaginator } from "./RamPaginator";
import { ContextualArgs } from "../utils/ContextualLoggedClass";

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
  RamConfig,
  RamStorage,
  RawRamQuery,
  RamContext
> {
  constructor(
    conf: RamConfig = {
      lock: new MultiLock(),
    } as any,
    alias?: string
  ) {
    super(conf, RamFlavour, alias);
    this.lock = conf.lock || new MultiLock();
  }

  /**
   * @description Gets the repository constructor for a model
   * @summary Returns a constructor for creating repositories that work with the specified model type.
   * This method overrides the base implementation to provide RAM-specific repository functionality.
   * @template M - The model type for the repository
   * @return {Constructor<RamRepository<M>>} A constructor for creating RAM repositories
   */
  override repository<
    R extends Repository<any, Adapter<any, any, any, any>>,
  >(): Constructor<R> {
    return super.repository<R>() as unknown as Constructor<R>;
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
    return Object.assign(
      await super.flags(
        operation,
        model,
        Object.assign(
          {
            UUID: flags.UUID || this.config.user || "" + Date.now(),
          },
          flags
        )
      )
    ) as RamFlags;
  }

  protected override Dispatch(): Dispatch<RamAdapter> {
    return super.Dispatch() as Dispatch<RamAdapter>;
  }

  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock: Lock;

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
    ...args: [...any[], RamContext]
  ): {
    record: Record<string, any>;
    id: string;
    transient?: Record<string, any>;
  } {
    const ctx = args.pop();
    const prepared = super.prepare(model, ...args, ctx);
    return prepared;
  }

  /**
   * @description Converts a stored record back to a model instance
   * @summary Reconstructs a model instance from a stored record by adding back the primary key.
   * This method is the inverse of the prepare method.
   * @template M - The model type to revert to
   * @param {Record<string, any>} obj - The stored record
   * @param {Constructor<M>} clazz - The model class or name
   * @param {PrimaryKeyType} id - The primary key value
   * @return {M} The reconstructed model instance
   */
  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    transient?: Record<string, any>,
    ...args: [...any[], RamContext]
  ): M {
    const res = super.revert(obj, clazz, id, transient, ...args);
    return res;
  }

  /**
   * @description Creates a new record in the in-memory storage
   * @summary Stores a new record in the specified table with the given ID.
   * This method acquires a lock to ensure thread safety, creates the table if it doesn't exist,
   * checks for conflicts, and stores the model.
   * @param {string} clazz - The name of the table to store the record in
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
    const { log } = this.logCtx(args, this.create);
    const tableName = Model.tableName(clazz);
    log.debug(`creating record in table ${tableName} with id ${id}`);
    await this.lock.acquire(tableName);
    if (!this.client.has(tableName)) this.client.set(tableName, new Map());
    if (
      this.client.get(tableName) &&
      this.client.get(tableName)?.has(id as any)
    ) {
      this.lock.release(tableName);
      throw new ConflictError(
        `Record with id ${id} already exists in table ${tableName}`
      );
    }

    this.client.get(tableName)?.set(id as any, model);
    this.lock.release(tableName);
    return model;
  }

  /**
   * @description Retrieves a record from in-memory storage
   * @summary Fetches a record with the specified ID from the given table.
   * This method checks if the table and record exist and throws appropriate errors if not.
   * @param {Constructor} clazz - The name of the table to retrieve from
   * @param {PrimaryKeyType} id - The unique identifier of the record to retrieve
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
    const { log } = this.logCtx(args, this.read);
    const tableName = Model.tableName(clazz);
    log.debug(`reading record in table ${tableName} with id ${id}`);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as any)) {
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    }
    return this.client.get(tableName)?.get(id as any);
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
    const { log } = this.logCtx(args, this.update);
    const tableName = Model.tableName(clazz);
    log.debug(`updating record in table ${tableName} with id ${id}`);

    await this.lock.acquire(tableName);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as any)) {
      this.lock.release(tableName);
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    }

    this.client.get(tableName)?.set(id as any, model);
    this.lock.release(tableName);
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
    const { log } = this.logCtx(args, this.delete);
    const tableName = Model.tableName(clazz);
    log.debug(`deleting record from table ${tableName} with id ${id}`);

    await this.lock.acquire(tableName);
    if (!this.client.has(tableName))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!this.client.get(tableName)?.has(id as any)) {
      this.lock.release(tableName);
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    }

    const natived = this.client.get(tableName)?.get(id as any);
    this.client.get(tableName)?.delete(id as any);
    this.lock.release(tableName);
    return natived;
  }

  /**
   * @description Gets or creates a table in the in-memory storage
   * @summary Retrieves the Map representing a table for a given model class.
   * If the table doesn't exist, it creates a new one so callers can insert or
   * query entities without null reference checks.
   * @template M - The model type for the table
   * @param {Constructor<M>} from - The model class
   * @return {Map<string | number, any> | undefined} The table Map or undefined
   */
  protected tableFor<M extends Model>(from: Constructor<M>) {
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
  async raw<R, D extends boolean>(
    rawInput: RawRamQuery<any>,
    docsOnly: D = true as D,
    ...args: ContextualArgs<RamContext>
  ): Promise<RawResult<R, D>> {
    const { log, ctx } = this.logCtx(args, this.raw);
    log.debug(`performing raw query: ${JSON.stringify(rawInput)}`);

    const {
      where,
      sort,
      limit,
      skip,
      from,
      groupBy,
      count: countField,
      countDistinct: countDistinctField,
      min: minField,
      max: maxField,
      sum: sumField,
      avg: avgField,
      distinct: distinctField,
    } = rawInput;
    let { select } = rawInput;
    const collection = this.tableFor(from);
    if (!collection)
      throw new InternalError(`Table ${from} not found in RamAdapter`);
    const clazz = from;
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
    if (sort) result = result.sort(sort);

    result = where ? result.filter(where) : result;

    // Handle aggregate operations
    if ('count' in rawInput) {
      // Count operation
      if (!countField) {
        // Count all records (COUNT(*))
        return result.length as unknown as RawResult<R, D>;
      } else {
        // Count specific field (non-null values) (COUNT(field))
        const count = result.filter(r => r[countField as string] !== undefined && r[countField as string] !== null).length;
        return count as unknown as RawResult<R, D>;
      }
    }

    if (countDistinctField !== undefined) {
      const seen = new Set();
      for (const item of result) {
        const value = item[countDistinctField as string];
        if (value !== undefined && value !== null) {
          seen.add(JSON.stringify(value));
        }
      }
      return seen.size as unknown as RawResult<R, D>;
    }

    if (minField !== undefined) {
      this.ensureFieldType(
        clazz,
        minField as string,
        "MIN operation",
        (type) => this.isNumericType(type) || type === "date",
        "numeric or date"
      );
      // Min operation
      if (result.length === 0) return null as unknown as RawResult<R, D>;
      const values = result.map(r => r[minField as string]).filter(v => v !== undefined && v !== null);
      if (values.length === 0) return null as unknown as RawResult<R, D>;

      // Find minimum value preserving original type
      let minValue = values[0];
      for (const v of values) {
        const comparison = v instanceof Date ? v.getTime() : (typeof v === 'bigint' ? Number(v) : Number(v));
        const minComparison = minValue instanceof Date ? minValue.getTime() : (typeof minValue === 'bigint' ? Number(minValue) : Number(minValue));
        if (comparison < minComparison) {
          minValue = v;
        }
      }
      return minValue as unknown as RawResult<R, D>;
    }

    if (maxField !== undefined) {
      this.ensureFieldType(
        clazz,
        maxField as string,
        "MAX operation",
        (type) => this.isNumericType(type) || type === "date",
        "numeric or date"
      );
      // Max operation
      if (result.length === 0) return null as unknown as RawResult<R, D>;
      const values = result.map(r => r[maxField as string]).filter(v => v !== undefined && v !== null);
      if (values.length === 0) return null as unknown as RawResult<R, D>;

      // Find maximum value preserving original type
      let maxValue = values[0];
      for (const v of values) {
        const comparison = v instanceof Date ? v.getTime() : (typeof v === 'bigint' ? Number(v) : Number(v));
        const maxComparison = maxValue instanceof Date ? maxValue.getTime() : (typeof maxValue === 'bigint' ? Number(maxValue) : Number(maxValue));
        if (comparison > maxComparison) {
          maxValue = v;
        }
      }
      return maxValue as unknown as RawResult<R, D>;
    }

    if (sumField !== undefined) {
      this.ensureFieldType(
        clazz,
        sumField as string,
        "SUM operation",
        (type) => this.isNumericType(type),
        "numeric"
      );
      if (result.length === 0) return null as unknown as RawResult<R, D>;
      const values = result
        .map((r) => r[sumField as string])
        .filter((v) => v !== undefined && v !== null);
      if (values.length === 0) return null as unknown as RawResult<R, D>;
      const sum = values.reduce(
        (acc, v) =>
          acc + this.toNumericValue(v, sumField as string, "SUM operation"),
        0
      );
      return sum as unknown as RawResult<R, D>;
    }

    if (avgField !== undefined) {
      const fieldType = this.resolveFieldType(clazz, avgField as string);
      const isDateField = fieldType === "date";
      this.ensureFieldType(
        clazz,
        avgField as string,
        "AVG operation",
        (type) => this.isNumericType(type) || type === "date",
        "numeric or date"
      );
      if (result.length === 0) return null as unknown as RawResult<R, D>;
      const values = result
        .map((r) => r[avgField as string])
        .filter((v) => v !== undefined && v !== null);
      if (values.length === 0) return null as unknown as RawResult<R, D>;

      if (isDateField) {
        const timestamps = values.map((v) =>
          v instanceof Date ? v.getTime() : new Date(v).getTime()
        );
        const avgTimestamp =
          timestamps.reduce((acc, t) => acc + t, 0) / timestamps.length;
        return new Date(avgTimestamp) as unknown as RawResult<R, D>;
      }

      const total = values.reduce(
        (acc, v) =>
          acc + this.toNumericValue(v, avgField as string, "AVG operation"),
        0
      );
      const average = total / values.length;
      return average as unknown as RawResult<R, D>;
    }

    if (distinctField !== undefined) {
      // Distinct operation
      const seen = new Set();
      const distinctResults: any[] = [];
      for (const item of result) {
        const value = item[distinctField as string];
        const key = JSON.stringify(value);
        if (!seen.has(key)) {
          seen.add(key);
          distinctResults.push(value);
        }
      }
      return distinctResults as unknown as RawResult<R, D>;
    }

    let count: number;
    let output: any[] | Record<string, any>;
    if (groupBy && groupBy.length) {
      const grouped = this.groupRecords(result, groupBy as (keyof Model)[]);
      const keys = Object.keys(grouped);
      count = keys.length;
      output = this.applyGroupPagination(grouped, skip, limit);
    } else {
      count = result.length;
      let paged = result;
      if (skip) paged = paged.slice(skip);
      if (limit) paged = paged.slice(0, limit);
      output = paged;
    }

    if (select && !(groupBy && groupBy.length)) {
      select = Array.isArray(select) ? select : [select];
      output = (output as any[]).map((row) =>
        Object.entries(row).reduce((acc: Record<string, any>, [key, val]) => {
          if ((select as string[]).includes(key)) acc[key] = val;
          return acc;
        }, {})
      );
    }

    if (docsOnly) return output as unknown as RawResult<R, D>;
    return {
      data: output,
      count,
    } as RawResult<R, D>;
  }

  private groupRecords(
    records: any[],
    selectors: (keyof Model)[]
  ): Record<string, any> {
    if (!selectors.length) return records as Record<string, any>;
    const [current, ...rest] = selectors;
    const grouped: Record<string, any[]> = {};
    for (const record of records) {
      const key = this.normalizeGroupKey(record[current as string]);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(record);
    }
    if (!rest.length) return grouped;
    const nested: Record<string, any> = {};
    for (const [key, values] of Object.entries(grouped)) {
      nested[key] = this.groupRecords(values, rest);
    }
    return nested;
  }

  private normalizeGroupKey(value: any): string {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "symbol") return value.toString();
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private applyGroupPagination(
    grouped: Record<string, any>,
    skip?: number,
    limit?: number
  ): Record<string, any> {
    if (typeof skip === "undefined" && typeof limit === "undefined") {
      return grouped;
    }
    const keys = Object.keys(grouped);
    const start = skip ?? 0;
    const end = typeof limit === "undefined" ? undefined : start + limit;
    const paged: Record<string, any> = {};
    for (const key of keys.slice(start, end)) {
      paged[key] = grouped[key];
    }
    return paged;
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
  Statement<M extends Model<boolean>>(
    overrides?: Partial<AdapterFlags>
  ): RamStatement<M, any, Adapter<any, any, RawRamQuery<M>, RamContext>> {
    return new RamStatement<
      M,
      any,
      Adapter<any, any, RawRamQuery<M>, RamContext>
    >(this as any, overrides);
  }

  Paginator<M extends Model<boolean>>(
    query: RawRamQuery,
    size: number,
    clazz: Constructor<M>
  ): RamPaginator<M> {
    return new RamPaginator(this, query, size, clazz);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        onCreateUpdate(createdByOnRamCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();
  }

  private ensureFieldType(
    clazz: Constructor<Model>,
    field: string,
    context: string,
    predicate: (type: string) => boolean,
    description: string
  ) {
    const type = this.resolveFieldType(clazz, field);
    if (!type || !predicate(type)) {
      throw new QueryError(
        `${context} requires ${description} attribute, but "${field}" is ${
          type || "unknown"
        }`
      );
    }
  }

  private resolveFieldType(
    clazz: Constructor<Model>,
    field: string
  ): string | undefined {
    const propKey = field as keyof Model<false>;
    const metaType =
      Metadata.type(clazz, propKey) ??
      Metadata.getPropDesignTypes(clazz, propKey)?.designType;
    return this.normalizeMetaType(metaType);
  }

  private normalizeMetaType(metaType: any): string | undefined {
    if (!metaType) return undefined;
    if (typeof metaType === "string") return metaType.toLowerCase();
    if (typeof metaType === "function" && metaType.name)
      return metaType.name.toLowerCase();
    return undefined;
  }

  private isNumericType(type?: string): boolean {
    return type === "number" || type === "bigint";
  }

  private toNumericValue(
    value: any,
    field: string,
    context: string
  ): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    throw new QueryError(
      `${context} on "${field}" requires numeric values, but got ${typeof value}`
    );
  }

  protected override getClient(): RamStorage {
    return new Map();
  }
}

Adapter.setCurrent(RamFlavour);
RamAdapter.decoration();
