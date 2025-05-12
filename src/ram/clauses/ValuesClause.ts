import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { RamQuery } from "../types";
import { ValuesClause } from "../../query";

export class RamValuesClause<M extends Model> extends ValuesClause<
  RamQuery<any>,
  M
> {
  constructor(clause: ModelArg<ValuesClause<RamQuery<any>, M>>) {
    super(clause);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  build(previous: RamQuery<any>): RamQuery<any> {
    throw new InternalError("Not implemented");
  }
}
