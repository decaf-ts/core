import { Paginator, Statement } from "../query";
import { RamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence";
import { RamPaginator } from "./RamPaginator";
import { InternalError } from "@decaf-ts/db-decorators";

export class RamStatement<M extends Model, R> extends Statement<
  RamQuery<M>,
  M,
  R
> {
  constructor(db: Adapter<any, RamQuery<M>, any, any>) {
    super(db);
  }

  paginate(size: number): Promise<Paginator<R, RamQuery<M>>> {
    try {
      const query = this.build();
      return new RamPaginator(this, size, query) as any;
    } catch (e: any) {
      throw new InternalError(e);
    }
  }
}
