import { Model } from "@decaf-ts/decorator-validation";
import { Statement } from "../query/Statement";

/**
 * @summary processes query objects
 *
 * @typedef V the output
 *
 * @interface Executor
 *
 * @category Query
 */
export interface Executor<R> {
  /**
   * @summary Processes itself
   *
   * @param {any[]} args
   *
   * @method
   */
  execute(...args: any): Promise<R>;
}

export type InferType<M extends Model, T> = T extends { selectors: infer I }
  ? I extends undefined
    ? M[]
    : I extends keyof M
      ? M[I]
      : never
  : never;

export interface StatementExecutor<M extends Model> {
  selectors?: (keyof M)[];
  execute(): Promise<InferType<M, StatementExecutor<M>>>;
}

export interface ClauseExecutor<R> {
  execute(): Promise<R>;
}
