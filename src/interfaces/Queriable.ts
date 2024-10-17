import { Condition, SelectSelector, WhereOption } from "../query";
import { OrderDirection } from "../repository";

export interface Queriable {
  select(selector?: SelectSelector): WhereOption;

  query<V>(
    condition: Condition,
    orderBy: string,
    order: OrderDirection,
    limit?: number,
    skip?: number,
  ): Promise<V>;
}
