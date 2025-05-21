import { Paginator } from "../query/Paginator";
import { Model } from "@decaf-ts/decorator-validation";

export interface Paginatable {
  paginate<M extends Model>(...args: any[]): Promise<Paginator<M, any>>;
}
