import { Paginator, Statement } from "../query";
import { RamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence";

export class RamStatement<M extends Model> extends Statement<RamQuery<M>> {
  constructor(db: Adapter<any, RamQuery<M>, any, any>) {
    super(db);
  }

  paginate<Y>(size: number): Promise<Paginator<Y, RamQuery<M>>> {
    return Promise.resolve(undefined) as any;
  }
}
