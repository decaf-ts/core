import {
  CountOption,
  DistinctOption,
  InsertOption,
  MaxOption,
  MinOption,
} from "./options";
import { SelectSelector } from "./selectors";
import { Adapter } from "../persistence";
import { Model } from "@decaf-ts/decorator-validation";
import { SelectClause } from "./clauses";

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
  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const S extends readonly SelectSelector<M>[],
  >(): SelectClause<any, M, M[]>;
  select<const S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): SelectClause<any, M, Pick<M, S[number]>[]>;
  select<const S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): SelectClause<any, M, M[]> | SelectClause<any, M, Pick<M, S[number]>[]> {
    return this.adapter.Clauses.select<M, S>(selector);
  }
  /**
   * @summary Creates a Min Clause
   * @param {SelectSelector} selector
   */
  min<const S extends SelectSelector<M>>(selector: S): MinOption<M, M[S]> {
    return this.select().min(selector) as MinOption<M, M[S]>;
  }
  /**
   * @summary Creates a Max Clause
   * @param {SelectSelector} selector
   */
  max<const S extends SelectSelector<M>>(selector: S): MaxOption<M, M[S]> {
    return this.select().max(selector);
  }
  /**
   * @summary Creates a Distinct Clause
   * @param {SelectSelector} selector
   */
  distinct<const S extends SelectSelector<M>>(
    selector: S
  ): DistinctOption<M, M[S][]> {
    return this.select().distinct(selector);
  }
  /**
   * @summary Creates a Count Clause
   * @param {SelectSelector} selector
   */
  count<const S extends SelectSelector<M>>(
    selector?: S
  ): CountOption<M, number> {
    return this.select().count(selector) as CountOption<M, number>;
  }

  insert(): InsertOption<M> {
    return this.adapter.Clauses.insert<M>();
  }
}
