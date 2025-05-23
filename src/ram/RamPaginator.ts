import { RawRamQuery } from "./types";
import { Paginator } from "../query";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence";

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

  protected prepare(rawStatement: RawRamQuery<M>): RawRamQuery<M> {
    const query: RawRamQuery<any> = Object.assign({}, rawStatement);
    query.limit = this.size;
    return query;
  }

  async page(page: number = 1): Promise<R[]> {
    page = this.validatePage(page);
    const statement = this.prepare(this.statement);
    statement.skip = (page - 1) * this.size;
    const results: any[] = await this.adapter.raw(statement);
    this._currentPage = page;
    return results;
  }
}
