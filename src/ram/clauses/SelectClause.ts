import { ModelArg, Model } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { Const, SelectClause } from "../../query";

export class RamSelectClause<M extends Model> extends SelectClause<
  RamQuery<any>,
  M
> {
  constructor(clause: ModelArg<SelectClause<RamQuery<any>, M>>) {
    super(clause);
  }

  build(query: RamQuery<any>): RamQuery<any> {
    if (!this.selector || this.selector === Const.FULL_RECORD) {
      query.select = undefined;
      return query;
    }

    const selector =
      typeof this.selector === "string" ? [this.selector] : this.selector;
    query.select = selector as (keyof M)[];
    return query;
  }
}
