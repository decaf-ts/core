import {
  CountOption,
  DistinctOption,
  InsertOption,
  MaxOption,
  MinOption,
  SelectOption,
} from "./options";
import { SelectSelector } from "./selectors";
import { Adapter } from "../persistence";
import { Model } from "@decaf-ts/decorator-validation";
import { DistinctQueryResult, QueryResult, ReducedResult } from "./types";

/**
 * @summary Helper Class to build queries
 *
 * @param {Database} db
 *
 * @class Query
 *
 * @category Query
 */
export class Query<Q, M extends Model> {
  constructor(private adapter: Adapter<any, Q, any, any>) {}

  /**
   * @summary Creates a Select Clause
   * @param {SelectSelector} [selector]
   */
  select<S extends SelectSelector<M>[]>(
    selector?: SelectSelector<M>[]
  ): SelectOption<M, QueryResult<M, S>> {
    return this.adapter.Clauses.select(selector);
  }
  /**
   * @summary Creates a Min Clause
   * @param {SelectSelector} selector
   */
  min<R extends SelectSelector<M>>(
    selector: R
  ): MinOption<M, ReducedResult<M, R>> {
    return this.select().min(selector) as MinOption<M, ReducedResult<M, R>>;
  }
  /**
   * @summary Creates a Max Clause
   * @param {SelectSelector} selector
   */
  max<R extends SelectSelector<M>>(
    selector: R
  ): MaxOption<M, ReducedResult<M, R>> {
    return this.select().max(selector);
  }
  /**
   * @summary Creates a Distinct Clause
   * @param {SelectSelector} selector
   */
  distinct<R extends SelectSelector<M>>(
    selector: R
  ): DistinctOption<M, DistinctQueryResult<M, R>> {
    return this.select().distinct(selector);
  }
  /**
   * @summary Creates a Count Clause
   * @param {SelectSelector} selector
   */
  count(selector?: SelectSelector<M>): CountOption<M, number> {
    return this.select().count(selector) as CountOption<M, number>;
  }

  insert(): InsertOption<M> {
    return this.adapter.Clauses.insert<M>();
  }
}
