import {
  BulkCrudOperationKeys,
  Context,
  ContextOfRepository,
  FlagsOfContext,
  FlagsOfRepository,
  IRepository,
  LoggerOfContext,
  LoggerOfFlags,
  LoggerOfRepository,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Adapter } from "./Adapter";
import { Observable, type Observer } from "../interfaces/index";
import { Logger } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { ContextualArgs } from "../utils/index";

export type ContextOf<
  OBJ extends IRepository<any, any> | Adapter<any, any, any, any>,
> =
  OBJ extends Adapter<any, any, any, infer C>
    ? C
    : OBJ extends IRepository<any, any>
      ? ContextOfRepository<OBJ>
      : never;

export type LoggerOfAdapter<A extends Adapter<any, any, any, any>> =
  A extends Adapter<any, any, any, infer C> ? LoggerOfContext<C> : never;

export type FlagsOfAdapter<A extends Adapter<any, any, any, any>> =
  A extends Adapter<any, any, any, infer C> ? FlagsOfContext<C> : never;

export type LoggerOf<
  OBJ extends
    | RepositoryFlags<any>
    | Context<any>
    | Adapter<any, any, any>
    | IRepository<any, any>,
> =
  OBJ extends RepositoryFlags<any>
    ? LoggerOfFlags<OBJ>
    : OBJ extends Context<any>
      ? LoggerOfContext<OBJ>
      : OBJ extends IRepository<any, any>
        ? LoggerOfRepository<OBJ>
        : OBJ extends Adapter<any, any, any>
          ? // @ts-expect-error ts is dumb. it's not infinite
            LoggerOfAdapter<OBJ>
          : Logger;

export type FlagsOf<
  OBJ extends
    | IRepository<any, any>
    | Adapter<any, any, any, any>
    | Context<any>,
> =
  OBJ extends Context<any>
    ? FlagsOfContext<OBJ>
    : OBJ extends IRepository<any, any>
      ? FlagsOfRepository<OBJ>
      : OBJ extends Adapter<any, any, any, any>
        ? FlagsOfAdapter<OBJ>
        : never;

export type PersistenceObservable<CONTEXT extends Context<any>> = Observable<
  [Observer, ObserverFilter?],
  [
    Constructor | string,
    OperationKeys | BulkCrudOperationKeys | string,
    EventIds,
    ...ContextualArgs<CONTEXT>,
  ]
>;

export type PersistenceObserver<CONTEXT extends Context<any>> = Observer<
  [
    Constructor | string,
    OperationKeys | BulkCrudOperationKeys | string,
    EventIds,
    ...ContextualArgs<CONTEXT>,
  ]
>;

/**
 * @description Type representing possible ID formats for database events
 * @summary A union type that defines the possible formats for event identifiers in the persistence layer.
 * These can be single values (string, number, bigint) or arrays of these types.
 * @typedef {(string|number|bigint|string[]|number[]|bigint[])} EventIds
 * @memberOf module:core
 */
export type EventIds =
  | string
  | number
  | bigint
  | string[]
  | number[]
  | bigint[];

export type ObserverFilter = (
  table: string | Constructor,
  event: OperationKeys | BulkCrudOperationKeys | string,
  id: EventIds,
  ...args: [...any[], Context<any>]
) => boolean;

export type InferredAdapterConfig<A> =
  A extends Adapter<infer CONF, any, any> ? CONF : never;

export interface AdapterDispatch<A extends Adapter<any, any, any, any>>
  extends PersistenceObservable<ContextOf<A>> {
  close(): Promise<void>;

  updateObservers<M extends Model>(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;
}

export interface Migration<QUERYRUNNER, A extends Adapter<any, any, any, any>> {
  transaction: boolean;
  up(qr: QUERYRUNNER, adapter?: A, ctx?: ContextOf<A>): Promise<void>;
  down(qr: QUERYRUNNER, adapter?: A, ctx?: ContextOf<A>): Promise<void>;
}

export type RepositoryFor<A extends Adapter<any, any, any, any>> =
  A extends Adapter<any, any, any, any> ? ReturnType<A["repository"]> : never;

export type PreparedModel = {
  record: Record<string, any>;
  id: string;
  transient?: Record<string, any>;
};
