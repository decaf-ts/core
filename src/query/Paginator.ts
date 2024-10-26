import { PagingError } from "./errors";
import { Statement } from "./Statement";

export abstract class Paginator<V, Q> {
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

  get statement() {
    if (!this._statement) this._statement = this.prepare(this._rawStatement);
    return this._statement;
  }

  protected get adapter() {
    return this.stat.getAdapter();
  }

  protected constructor(
    protected stat: Statement<Q>,
    readonly size: number,
    protected readonly _rawStatement: Q
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
        "page number cannot be under 1 and must be an integer"
      );
    if (page > this._totalPages)
      throw new PagingError(
        "page number cannot be under 1 and must be an integer"
      );
  }

  abstract page(page?: number, ...args: any[]): Promise<V[]>;
}
