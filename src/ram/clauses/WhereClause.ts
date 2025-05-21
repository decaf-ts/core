import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { Condition, WhereClause } from "../../query";

export class RamWhereClause<M extends Model> extends WhereClause<
  RamQuery<M>,
  M
> {
  constructor(clause: ModelArg<WhereClause<RamQuery<M>, M>>) {
    super(clause);
  }

  build(query: RamQuery<M>): RamQuery<M> {
    query.where = this.adapter.parseCondition(
      this.condition as Condition<M>
    ).where;
    return query;
  }
}
