import { Paginator } from "../query/Paginator";
import { Model } from "@decaf-ts/decorator-validation";

export interface Paginatable<M extends Model, R, Q> {
  paginate(size: number): Promise<Paginator<M, R, Q>>;
}
