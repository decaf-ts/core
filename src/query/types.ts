import { Model } from "@decaf-ts/decorator-validation";

export type QueryResult<M extends Model, T> = (T extends keyof M
  ? {
      [K in keyof M]: M[K];
    }
  : M)[];

export type DistinctQueryResult<M extends Model, T> = T extends keyof M
  ? M[T]
  : never;

export type ReducedResult<M extends Model, T> = T extends keyof M
  ? M[T]
  : never;

export type CountResult<M extends Model, T> = T extends keyof M
  ? number
  : never;

export type AttributeResult = Record<string, string>;

export type OperationResult = Record<string, AttributeResult | any>;
