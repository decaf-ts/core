import { Paginator } from "../query/Paginator";

export interface Paginatable<R, Q> {
  paginate(size: number): Promise<Paginator<R, Q>>;
}
