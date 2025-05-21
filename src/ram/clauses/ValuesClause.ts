import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { RamQuery } from "../types";
import { ValuesClause } from "../../query";

export class RamValuesClause<M extends Model> extends ValuesClause<
  RamQuery<M>,
  M
> {
  constructor(clause: ModelArg<ValuesClause<RamQuery<M>, M>>) {
    super(clause);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  build(previous: RamQuery<M>): RamQuery<M> {
    throw new InternalError("Not implemented");
  }
}
