import { Paginator } from "../query/Paginator";

export interface Paginatable {
  paginate<V>(...args: any[]): Promise<Paginator<V, any>>;
}
