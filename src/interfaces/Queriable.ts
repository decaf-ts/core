import { Condition, SelectSelector, WhereOption } from "../query";
import { OrderDirection } from "../repository";
import { Model } from "@decaf-ts/decorator-validation";

export interface Queriable<M extends Model> {
  select(selector?: SelectSelector<M>): WhereOption<M>;

  query<V>(
    condition: Condition<M>,
    orderBy: keyof M,
    order: OrderDirection,
    limit?: number,
    skip?: number
  ): Promise<V>;
}
