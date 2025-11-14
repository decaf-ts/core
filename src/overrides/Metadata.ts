import "@decaf-ts/decoration";
import type { Model } from "@decaf-ts/decorator-validation";
import {
  Context,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import type { Adapter, Migration } from "../persistence/index";
import { Constructor } from "@decaf-ts/decoration";

declare module "@decaf-ts/decoration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Metadata {
    function validationExceptions<M extends Model>(
      model: Constructor<M>,
      op: OperationKeys
    ): string[];

    function migrationsFor<
      A extends Adapter<CONF, CONN, QUERY, FLAGS, CONTEXT>,
      CONF,
      CONN,
      QUERY,
      FLAGS extends RepositoryFlags = RepositoryFlags,
      CONTEXT extends Context<FLAGS> = Context<FLAGS>,
    >(
      adapter?: A
    ): Constructor<Migration<any, A, CONF, CONN, QUERY, FLAGS, CONTEXT>>[];
  }
}
