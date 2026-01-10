import { PagingError } from "./errors";
import {
  Adapter,
  PersistenceKeys,
  prefixMethod,
  UnsupportedError,
} from "../persistence";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { LoggedClass } from "@decaf-ts/logging";
import {
  ContextualArgs,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { DirectionLimitOffset, PreparedStatement } from "./types";
import { PreparedStatementKeys } from "./constants";
import { Repository } from "../repository/Repository";
import { SerializationError } from "@decaf-ts/db-decorators";

/**
 * @description Handles pagination for database queries
 * @summary Provides functionality for navigating through paginated query results
 *
 * This abstract class manages the state and navigation of paginated database query results.
 * It tracks the current page, total pages, and record count, and provides methods for
 * moving between pages.
 *
 * @template M - The model type this paginator operates on
 * @template R - The return type of the paginated query (defaults to M[])
 * @template Q - The query type (defaults to any)
 * @param {Adapter<any, Q, any, any>} adapter - The database adapter to use for executing queries
 * @param {Q} query - The query to paginate
 * @param {number} size - The number of records per page
 * @param {Constructor<M>} clazz - The constructor for the model type
 * @class Paginator
 * @example
 * // Create a paginator for a user query
 * const userQuery = db.select().from(User);
 * const paginator = await userQuery.paginate(10); // 10 users per page
 *
 * // Get the first page of results
 * const firstPage = await paginator.page(1);
 *
 * // Navigate to the next page
 * const secondPage = await paginator.next();
 *
 * // Get information about the pagination
 * console.log(`Page ${paginator.current} of ${paginator.total}, ${paginator.count} total records`);
 *
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Paginator
 *   participant Adapter
 *   participant Database
 *
 *   Client->>Paginator: new Paginator(adapter, query, size, clazz)
 *   Client->>Paginator: page(1)
 *   Paginator->>Paginator: validatePage(1)
 *   Paginator->>Paginator: prepare(query)
 *   Paginator->>Adapter: execute query with pagination
 *   Adapter->>Database: execute query
 *   Database-->>Adapter: return results
 *   Adapter-->>Paginator: return results
 *   Paginator-->>Client: return page results
 *
 *   Client->>Paginator: next()
 *   Paginator->>Paginator: page(current + 1)
 *   Paginator->>Paginator: validatePage(current + 1)
 *   Paginator->>Adapter: execute query with pagination
 *   Adapter->>Database: execute query
 *   Database-->>Adapter: return results
 *   Adapter-->>Paginator: return results
 *   Paginator-->>Client: return page results
 */
export abstract class Paginator<
  M extends Model,
  R = M[],
  Q = any,
> extends LoggedClass {
  protected _currentPage!: number;
  protected _totalPages!: number;
  protected _recordCount!: number;
  protected _bookmark?: number | string;
  protected limit!: number;

  private _statement?: Q;

  get current() {
    return this._currentPage;
  }

  get total() {
    return this._totalPages;
  }

  get count(): number {
    return this._recordCount;
  }

  protected get statement() {
    if (!this._statement) this._statement = this.prepare(this.query as Q);
    return this._statement;
  }

  protected constructor(
    protected readonly adapter: Adapter<any, any, Q, any>,
    protected readonly query: Q | PreparedStatement<M>,
    readonly size: number,
    protected readonly clazz: Constructor<M>
  ) {
    super();
    prefixMethod(this, this.page, this.pagePrefix, this.page.name);
  }

  protected isPreparedStatement() {
    const query = this.query as PreparedStatement<any>;
    return (
      query.method &&
      query.method.match(
        new RegExp(
          `${PreparedStatementKeys.FIND_BY}|${PreparedStatementKeys.LIST_BY}`,
          "gi"
        )
      )
    );
  }

  protected async pagePrefix(page?: number, ...args: MaybeContextualArg<any>) {
    const { ctxArgs } = (
      await this.adapter["logCtx"](
        [this.clazz, ...args],
        PersistenceKeys.QUERY,
        true
      )
    ).for(this.pagePrefix);
    ctxArgs.shift();
    return [page, ...ctxArgs];
  }

  protected async pagePrepared(
    page: number,
    bookmark?: any,
    ...argz: ContextualArgs<any>
  ): Promise<M[]> {
    const { log } = this.adapter["logCtx"](
      bookmark ? [...argz] : [bookmark, ...argz],
      this.pagePrepared
    );
    log.debug(
      `Running paged prepared statement ${page} page${bookmark ? ` - bookmark ${bookmark}` : ""}`
    );
    if (bookmark) this._bookmark = bookmark;
    const repo = Repository.forModel(this.clazz, this.adapter.alias);
    const statement = this.query as PreparedStatement<M>;
    const { method, args, params } = statement;
    const regexp = new RegExp(
      `^${PreparedStatementKeys.FIND_BY}|${PreparedStatementKeys.LIST_BY}`,
      "gi"
    );
    if (!method.match(regexp))
      throw new UnsupportedError(
        `Method ${method} is not supported for pagination`
      );
    regexp.lastIndex = 0;
    const pagedMethod = method.replace(regexp, PreparedStatementKeys.PAGE_BY);

    const preparedArgs = [pagedMethod, ...args];
    let preparedParams: DirectionLimitOffset = {
      limit: this.size,
      offset: page,
      bookmark: this._bookmark,
    };
    if (
      pagedMethod === PreparedStatementKeys.PAGE_BY &&
      preparedArgs.length <= 2
    ) {
      preparedArgs.push(params.direction);
    } else {
      preparedParams = {
        direction: params.direction,
        limit: this.size,
        offset: page,
        bookmark: this._bookmark,
      };
    }

    preparedArgs.push(preparedParams);

    if (argz.find((a) => Array.isArray(a) && a.length === 0))
      throw new Error("Invalid argument: empty array found");

    const result = await repo.statement(
      ...(preparedArgs as [string, any]),
      ...argz
    );
    return this.apply(result);
  }
  /**
   * @description Prepares a statement for pagination
   * @summary Modifies the raw query statement to include pagination parameters.
   * This protected method sets the limit parameter on the query to match the page size.
   * @param {RawRamQuery<M>} rawStatement - The original query statement
   * @return {RawRamQuery<M>} The modified query with pagination parameters
   */
  protected abstract prepare(rawStatement: Q): Q;

  async next(...args: MaybeContextualArg<any>) {
    return this.page(this.current + 1, ...args);
  }

  async previous(...args: MaybeContextualArg<any>) {
    return this.page(this.current - 1, ...args);
  }

  protected validatePage(page: number) {
    if (page < 1 || !Number.isInteger(page))
      throw new PagingError(
        "Page number cannot be under 1 and must be an integer"
      );
    if (typeof this._totalPages !== "undefined" && page > this._totalPages)
      throw new PagingError(
        `Only ${this._totalPages} are available. Cannot go to page ${page}`
      );
    return page;
  }

  async page(
    page: number = 1,
    bookmark?: any,
    ...args: MaybeContextualArg<any>
  ): Promise<R> {
    const { ctxArgs } = this.adapter["logCtx"]([bookmark, ...args], this.page);
    if (this.isPreparedStatement())
      return (await this.pagePrepared(page, ...ctxArgs)) as R;
    throw new UnsupportedError(
      "Raw support not available without subclassing this"
    );
  }

  serialize(data: M[], toString: boolean = false): string | SerializedPage<M> {
    const serialization: SerializedPage<M> = {
      data: data,
      current: this.current,
      total: this.total,
      count: this.count,
      bookmark: this._bookmark,
    };
    try {
      return toString ? JSON.stringify(serialization) : serialization;
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  apply(serialization: string | SerializedPage<M>): M[] {
    const ser =
      typeof serialization === "string"
        ? Paginator.deserialize<M>(serialization)
        : serialization;

    this._currentPage = ser.current;
    this._totalPages = ser.total;
    this._recordCount = ser.count;
    this._bookmark = ser.bookmark;
    return ser.data;
  }

  static deserialize<M extends Model>(str: string): SerializedPage<M> {
    try {
      return JSON.parse(str);
    } catch (e: unknown) {
      throw new SerializationError(e as Error);
    }
  }

  static isSerializedPage(obj: SerializedPage<any> | any) {
    return (
      obj &&
      typeof obj === "object" &&
      Array.isArray(obj.data) &&
      typeof obj.total === "number" &&
      typeof obj.current === "number" &&
      typeof obj.count === "number"
    );
  }
}

export type SerializedPage<M extends Model> = {
  current: number;
  total: number;
  count: number;
  data: M[];
  bookmark?: number | string;
};
