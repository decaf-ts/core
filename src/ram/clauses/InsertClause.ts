import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { RamQuery } from "../types";
import { InsertClause } from "../../query";

export class RamInsertClause<M extends Model> extends InsertClause<
  RamQuery<M>,
  M
> {
  constructor(clause: ModelArg<InsertClause<RamQuery<M>, M>>) {
    super(clause);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  build(query: RamQuery<M>): RamQuery<M> {
    throw new InternalError("Not supported");
  }
}
