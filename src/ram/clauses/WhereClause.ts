import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { Condition, WhereClause } from "../../query";

export class RamWhereClause<M extends Model, R> extends WhereClause<
  RamQuery<M>,
  M,
  R
> {
  constructor(clause: ModelArg<WhereClause<RamQuery<M>, M, R>>) {
    super(clause);
  }

  build(query: RamQuery<M>): RamQuery<M> {
    query.where = this.adapter.parseCondition(
      this.condition as Condition<M>
    ).where;
    return query;
  }
}
