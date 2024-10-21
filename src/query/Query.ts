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
import { Const } from "./constants";
import { Model } from "@decaf-ts/decorator-validation";

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
  constructor(private adapter: Adapter<any, Q>) {}

  /**
   * @summary Creates a Select Clause
   * @param {SelectSelector} [selector]
   */
  select(selector: SelectSelector = Const.FULL_RECORD): SelectOption<M> {
    return this.adapter.Clauses.select<M>(selector);
  }
  /**
   * @summary Creates a Min Clause
   * @param {SelectSelector} selector
   */
  min(selector: SelectSelector): MinOption<M> {
    return this.select().min(selector);
  }
  /**
   * @summary Creates a Max Clause
   * @param {SelectSelector} selector
   */
  max(selector: SelectSelector): MaxOption<M> {
    return this.select().max(selector);
  }
  /**
   * @summary Creates a Distinct Clause
   * @param {SelectSelector} selector
   */
  distinct(selector: SelectSelector): DistinctOption<M> {
    return this.select().distinct(selector);
  }
  /**
   * @summary Creates a Count Clause
   * @param {SelectSelector} selector
   */
  count(selector: SelectSelector): CountOption<M> {
    return this.select().count(selector);
  }

  insert(): InsertOption<M> {
    return this.adapter.Clauses.insert<M>();
  }
}
