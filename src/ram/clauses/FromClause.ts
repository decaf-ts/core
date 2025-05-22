import { ModelArg, Model, Constructor } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { FromClause } from "../../query";

export class RamFromClause<M extends Model, R> extends FromClause<
  RamQuery<M>,
  M,
  R
> {
  constructor(clause: ModelArg<FromClause<RamQuery<M>, M, R>>) {
    super(clause);
  }

  build(previous: RamQuery<M>): RamQuery<M> {
    previous.from = this.selector as Constructor<M> | string;
    return previous;
  }
}
