import { PagingError } from "./errors";
import { Adapter } from "../persistence";
import { Constructor, Model } from "@decaf-ts/decorator-validation";

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
    protected readonly adapter: Adapter<any, Q, any, any>,
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
