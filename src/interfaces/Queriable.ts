import { Condition, QueryResult, SelectSelector, WhereOption } from "../query";
import { OrderDirection } from "../repository";
import { Model } from "@decaf-ts/decorator-validation";

export interface Queriable<M extends Model> {
  select<S extends SelectSelector<M>[]>(
    selector?: SelectSelector<M>[]
  ): WhereOption<M, QueryResult<M, S>>;

  query(
    condition: Condition<M>,
    orderBy: keyof M,
    order: OrderDirection,
    limit?: number,
    skip?: number
  ): Promise<M[]>;
}
