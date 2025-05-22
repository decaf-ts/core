import { RamQuery } from "./types";
import { Paginator, Statement } from "../query";
import { Model } from "@decaf-ts/decorator-validation";

export class RamPaginator<V, M extends Model> extends Paginator<
  V,
  RamQuery<M>
> {
  constructor(
    statement: Statement<RamQuery<M>, any, any>,
    size: number,
    rawStatement: RamQuery<M>
  ) {
    super(statement, size, rawStatement);
  }

  protected prepare(rawStatement: RamQuery<M>): RamQuery<M> {
    const query: RamQuery<any> = Object.assign({}, rawStatement);
    query.limit = this.size;
    return query;
  }

  async page(page: number = 1, ...args: any[]): Promise<V[]> {
    page = this.validatePage(page);
    const statement = this.prepare(this.statement);
    statement.skip = (page - 1) * this.size;
    const results: any[] = await this.adapter.raw(statement, false, ...args);
    this._currentPage = page;
    return results;
  }
}
