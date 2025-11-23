import { RawRamQuery } from "./types";
import { Paginator } from "../query";
import { Model } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence";
import { Constructor } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";

/**
 * @description RAM-specific paginator implementation
 * @summary Extends the base Paginator class to provide pagination functionality for RAM adapter queries.
 * This class handles the pagination of query results from the in-memory storage, allowing
 * for efficient retrieval of large result sets in smaller chunks.
 * @template M - The model type being paginated
 * @template R - The result type returned by the paginator
 * @class RamPaginator
 * @category Ram
 * @example
 * ```typescript
 * // Create a query for User model
 * const query: RawRamQuery<User> = {
 *   select: undefined, // Select all fields
 *   from: User,
 *   where: (user) => user.active === true
 * };
 *
 * // Create a paginator with page size of 10
 * const paginator = new RamPaginator<User, User>(adapter, query, 10, User);
 *
 * // Get the first page of results
 * const firstPage = await paginator.page(1);
 *
 * // Get the next page
 * const secondPage = await paginator.page(2);
 * ```
 */
export class RamPaginator<M extends Model, R> extends Paginator<
  M,
  R,
  RawRamQuery<M>
> {
  constructor(
    adapter: Adapter<any, RawRamQuery<M>, any, any>,
    query: RawRamQuery<M>,
    size: number,
    clazz: Constructor<M>
  ) {
    super(adapter, query, size, clazz);
  }

  /**
   * @description Prepares a RAM query for pagination
   * @summary Modifies the raw query statement to include pagination parameters.
   * This protected method sets the limit parameter on the query to match the page size.
   * @param {RawRamQuery<M>} rawStatement - The original query statement
   * @return {RawRamQuery<M>} The modified query with pagination parameters
   */
  protected prepare(rawStatement: RawRamQuery<M>): RawRamQuery<M> {
    const query: RawRamQuery<any> = Object.assign({}, rawStatement);
    query.limit = this.size;
    return query;
  }

  /**
   * @description Retrieves a specific page of results
   * @summary Executes the query with pagination parameters to retrieve a specific page of results.
   * This method calculates the appropriate skip value based on the page number and page size,
   * executes the query, and updates the current page tracking.
   * @param {number} [page=1] - The page number to retrieve (1-based)
   * @return {Promise<R[]>} A promise that resolves to an array of results for the requested page
   */
  async page(page: number = 1): Promise<R[]> {
    const statement = this.prepare(this.statement);
    if (!this._recordCount || !this._totalPages) {
      this._totalPages = this._recordCount = 0;
      const results: R[] =
        (await this.adapter.raw(
          { ...statement, limit: undefined },
          await this.adapter.context(
            OperationKeys.READ,
            {},
            this.clazz
          )
        )) || [];
      this._recordCount = results.length;
      if (this._recordCount > 0) {
        const size = statement?.limit || this.size;
        this._totalPages = Math.ceil(this._recordCount / size);
      }
    }

    page = this.validatePage(page);
    statement.skip = (page - 1) * this.size;
    const results: any[] = await this.adapter.raw(
      statement,
      await this.adapter.context(OperationKeys.READ, {}, this.clazz)
    );
    this._currentPage = page;
    return results;
  }
}
