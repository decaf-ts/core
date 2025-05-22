import { Paginator } from "../query/Paginator";
import { Model } from "@decaf-ts/decorator-validation";

export interface Paginatable<R> {
  paginate(...args: any[]): Promise<Paginator<R, any>>;
}
