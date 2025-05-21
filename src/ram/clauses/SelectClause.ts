import {
  ModelArg,
  Model,
  ModelErrorDefinition,
} from "@decaf-ts/decorator-validation";
import { RamQuery } from "../types";
import { SelectClause } from "../../query";

export class RamSelectClause<M extends Model> extends SelectClause<
  RamQuery<M>,
  M
> {
  constructor(clause: ModelArg<SelectClause<RamQuery<M>, M>>) {
    super(clause);
  }

  hasErrors(
    previousVersion?: any,
    ...exclusions: string[]
  ): ModelErrorDefinition | undefined {
    if (!this.selector) return super.hasErrors("selector", ...exclusions);
    return super.hasErrors(previousVersion, ...exclusions);
  }

  build(query: RamQuery<M>): RamQuery<M> {
    if (!this.selector) {
      query.select = undefined;
      return query;
    }

    query.select = Array.isArray(this.selector)
      ? this.selector
      : [this.selector];
    return query;
  }
}
