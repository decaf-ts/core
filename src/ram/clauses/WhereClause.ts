import { ModelArg } from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { Condition, WhereClause } from "../../query";

export class RamWhereClause extends WhereClause<RamQuery<any>> {
  constructor(clause: ModelArg<WhereClause<RamQuery<any>>>) {
    super(clause);
  }

  build(query: RamQuery<any>): RamQuery<any> {
    query.where = this.adapter.parseCondition(
      this.condition as Condition
    ).where;
    return query;
  }
}
