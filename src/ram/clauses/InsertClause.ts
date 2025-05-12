import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { RamQuery } from "../types";
import { InsertClause } from "../../query";

// noinspection JSAnnotator
export class RamInsertClause<M extends Model> extends InsertClause<
  RamQuery<any>,
  M
> {
  constructor(clause: ModelArg<InsertClause<RamQuery<any>, M>>) {
    super(clause);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  build(query: RamQuery<any>): RamQuery<any> {
    throw new InternalError("Not supported");
  }
}
