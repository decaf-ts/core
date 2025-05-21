import { ModelArg, Model, Constructor } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { FromClause } from "../../query";

export class RamFromClause<M extends Model> extends FromClause<RamQuery<M>, M> {
  constructor(clause: ModelArg<FromClause<RamQuery<M>, M>>) {
    super(clause);
  }

  build(previous: RamQuery<M>): RamQuery<M> {
    previous.from = this.selector as Constructor<M> | string;
    return previous;
  }
}
