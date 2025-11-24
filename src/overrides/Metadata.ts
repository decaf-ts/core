import "@decaf-ts/decoration";
import type { Model } from "@decaf-ts/decorator-validation";
import {
  Context,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import type { Adapter, Migration } from "../persistence";
import type { Constructor } from "@decaf-ts/decoration";
import type { ExtendedRelationsMetadata } from "../model";

declare module "@decaf-ts/decoration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Metadata {
    function validationExceptions<M extends Model>(
      model: Constructor<M>,
      op: OperationKeys
    ): string[];

    function migrationsFor<
      A extends Adapter<CONF, CONN, QUERY, CONTEXT>,
      CONF,
      CONN,
      QUERY,
      FLAGS extends RepositoryFlags = RepositoryFlags,
      CONTEXT extends Context<FLAGS> = Context<FLAGS>,
    >(adapter?: A): Constructor<Migration<any, A>>[];

    function relations<M extends Model>(
      m: Constructor<M>
    ): string[] | undefined;
    function relations<M extends Model>(
      m: Constructor<M>,
      prop: keyof M
    ): ExtendedRelationsMetadata;
    function relations<M extends Model>(
      m: Constructor<M>,
      prop?: keyof M
    ): string[] | ExtendedRelationsMetadata | undefined;
  }
}
