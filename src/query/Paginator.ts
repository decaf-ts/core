import { PagingError } from "./errors";
import { Adapter } from "../persistence";
import { Model } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";

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
export abstract class Paginator<M extends Model, R = M[], Q = any> {
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
    if (!this._statement) this._statement = this.prepare(this.query);
    return this._statement;
  }

  protected constructor(
    protected readonly adapter: Adapter<any, any, Q, any, any>,
    protected readonly query: Q,
    readonly size: number,
    protected readonly clazz: Constructor<M>
  ) {}

  protected abstract prepare(rawStatement: Q): Q;

  async next() {
    return this.page(this.current + 1);
  }

  async previous() {
    return this.page(this.current - 1);
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

  abstract page(page?: number): Promise<R[]>;
}
