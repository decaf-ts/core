import "@decaf-ts/decoration";
import type { Model } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";
import type { Adapter } from "../persistence";
import type { Constructor } from "@decaf-ts/decoration";
import type { ExtendedRelationsMetadata } from "../model";
import { Context } from "../persistence/Context";
import type { AdapterFlags } from "../persistence/types";
import { TaskHandler } from "../tasks/TaskHandler";
import { Migration } from "../migrations/index";

declare module "@decaf-ts/decoration" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Metadata {
    function tasks():
      | Record<string, Constructor<TaskHandler<any, any>>>
      | undefined;

    function taskHandlerFor(
      type: string
    ): Constructor<TaskHandler<any, any>> | undefined;

    function validationExceptions<M extends Model>(
      model: Constructor<M>,
      op: OperationKeys
    ): string[];

    function migrationsFor<
      A extends Adapter<CONF, CONN, QUERY, CONTEXT>,
      CONF,
      CONN,
      QUERY,
      FLAGS extends AdapterFlags = AdapterFlags,
      CONTEXT extends Context<FLAGS> = Context<FLAGS>,
    >(adapter?: A): Constructor<Migration<any, A>>[];

    function migrations(): [string, Constructor<Migration<any, any>>][];

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
