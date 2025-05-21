import { RamQuery } from "./types";
import { findPrimaryKey } from "@decaf-ts/db-decorators";
import { Paginator, PagingError, Statement } from "../query";
import { SequenceOptions } from "../interfaces";
import { parseSequenceValue } from "./RamSequence";

export class RamPaginator<V> extends Paginator<V, RamQuery<any>> {
  constructor(
    statement: Statement<RamQuery<any>>,
    size: number,
    rawStatement: RamQuery<any>
  ) {
    super(statement, size, rawStatement);
  }

  protected prepare(rawStatement: RamQuery<any>): RamQuery<any> {
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
