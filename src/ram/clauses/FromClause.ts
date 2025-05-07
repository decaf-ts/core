import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { FromClause } from "../../query";

export class RamFromClause<M extends Model> extends FromClause<
  RamQuery<any>,
  M
> {
  constructor(clause: ModelArg<FromClause<RamQuery<any>, M>>) {
    super(clause);
  }

  build(previous: RamQuery<any>): RamQuery<any> {
    previous.from = this.selector;
    return previous;
  }
}
