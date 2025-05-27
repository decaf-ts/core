import { Condition, SelectSelector, WhereOption } from "../query";
import { OrderDirection } from "../repository";
import { Model } from "@decaf-ts/decorator-validation";

export interface Queriable<M extends Model> {
  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<M>[],
  >(): WhereOption<M, M[]>;
  select<S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): WhereOption<M, Pick<M, S[number]>[]>;

  /**
   *
   * @template S the selector to be used
   * @param {string[]} [selector] keys to be selected
   */
  select<S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): WhereOption<M, M[]> | WhereOption<M, Pick<M, S[number]>[]>;

  /**
   *
   * @param condition
   * @param orderBy
   * @param order
   * @param limit
   * @param skip
   */
  query(
    condition: Condition<M>,
    orderBy: keyof M,
    order: OrderDirection,
    limit?: number,
    skip?: number
  ): Promise<M[]>;
}
