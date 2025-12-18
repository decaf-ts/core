import { PagingError } from "./errors";
import {
  Adapter,
  Context,
  PersistenceKeys,
  prefixMethod,
  UnsupportedError,
} from "../persistence";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { LoggedClass } from "@decaf-ts/logging";
import { ContextualArgs, MaybeContextualArg } from "../utils/index";
import { PreparedStatement } from "./types";
import { PreparedStatementKeys } from "./constants";
import { Repository } from "../repository/Repository";

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
    const contextArgs = await Context.args<M, any>(
      PersistenceKeys.QUERY,
      this.clazz,
      args,
      this.adapter
    );

    return [page, ...contextArgs.args];
  }

  protected pagePrepared(page?: number, ...argz: ContextualArgs<any>) {
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
    const result = repo.statement(
      pagedMethod,
      ...args,
      page,
      Object.assign({}, params, { limit: this.size }),
      ...argz
    );
    return result;
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

  async page(page: number = 1, ...args: MaybeContextualArg<any>): Promise<R[]> {
    const { ctxArgs } = this.adapter["logCtx"](args, this.page);
    if (this.isPreparedStatement()) return this.pagePrepared(page, ...ctxArgs);
    throw new UnsupportedError(
      "Raw support not available without subclassing this"
    );
  }
}
