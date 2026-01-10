import { DefaultMigrationConfig } from "../migrations/constants";
import { migration } from "../migrations/decorators";
import { Migration, MigrationConfig } from "../migrations/types";
import { ClientBasedService, Service } from "./services";
import { Adapter } from "../persistence/Adapter";
import { Context } from "../persistence/Context";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationError } from "../persistence/errors";
import { AdapterFlags, ContextOf, FlagsOf } from "../persistence/types";
import {
  ContextualArgs,
  ContextualizedArgs,
  ContextualLoggedClass,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/index";
import { style } from "@decaf-ts/logging";
import { Metadata } from "@decaf-ts/decoration";
import { InternalError } from "@decaf-ts/db-decorators";

@migration(null)
export class MigrationService<
    PERSIST extends boolean,
    A extends Adapter<any, any, any, any> = any,
  >
  extends ClientBasedService<
    PERSIST extends boolean ? A : void,
    MigrationConfig<PERSIST>
  >
  implements Migration<any, any>
{
  flavour?: string;
  readonly reference: string = MigrationService.name;
  readonly precedence: Migration<any, any> | Migration<any, any>[] | null =
    null;
  transaction!: boolean;

  constructor() {
    super();
  }

  async initialize(...args: MaybeContextualArg<ContextOf<A>>): Promise<{
    config: MigrationConfig<PERSIST>;
    client: PERSIST extends boolean ? A : void;
  }> {
    const { log, ctx } = await this.logCtx(args, this.initialize, true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const persistence = Service.get(PersistenceKeys.PERSISTENCE);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      if (!ctx.get("ignoreDevSafeGuards"))
        log.warn(
          `Persistence service not available. this may indicate poor initialization of the persistence layer (or not)`
        );
    }

    const cfg: MigrationConfig<PERSIST> = Object.assign(
      {},
      args.length ? args[0] : DefaultMigrationConfig,
      DefaultMigrationConfig
    );
    this.transaction = cfg.persistMigrationSteps;
    return {
      config: cfg,
      client: Adapter.get(cfg.persistenceFlavour) as PERSIST extends boolean
        ? A
        : void,
    };
  }

  async down(
    qr: any,
    adapter: any,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    log.verbose(style("Cleaning up after all migrations").green.bold);
  }

  protected sort(migrations: Migration<any, any>[]) {
    return migrations.sort((migration1, migration2) => {
      if (!migration1.precedence && !migration2.precedence)
        throw new InternalError(
          `Only one migration can have a null precedence: ${migration1.reference} vs ${migration2.reference}`
        );
      if (!migration1.precedence) return 1;
      if (!migration2.precedence) return -1;
      const precedences1 = Array.isArray(migration1.precedence)
        ? migration1.precedence
        : [migration1];
      const precedences2 = Array.isArray(migration2.precedence)
        ? migration2.precedence
        : [migration2];

      const includes1 = precedences1.every((p) => p === migration2);
      const includes2 = precedences2.every((p) => p === migration1);

      // sort when they reference each other
      if (includes1 && !includes2) return 1;
      if (includes2 && !includes1) return -1;

      const anyNotIncluded1 = precedences1.find(
        (p) => !precedences2.includes(p)
      );
      const allIncluded1 = precedences1.every((p) => precedences2.includes(p));

      const anyNotIncluded2 = precedences2.find(
        (p) => !precedences1.includes(p)
      );
      const allIncluded2 = precedences2.every((p) => precedences1.includes(p));

      // solve all differences
      if (anyNotIncluded1 && !anyNotIncluded2 && !allIncluded1 && !allIncluded2)
        return 1;
      if (!anyNotIncluded1 && anyNotIncluded2 && !allIncluded1 && !allIncluded2)
        return -1;
      if (!anyNotIncluded1 && !anyNotIncluded2 && allIncluded1 && !allIncluded2)
        return -1;
      if (!anyNotIncluded1 && !anyNotIncluded2 && !allIncluded1 && allIncluded2)
        return 1;

      if (!anyNotIncluded1 && !anyNotIncluded2 && allIncluded1 && !allIncluded2)
        return -1;
      if (!anyNotIncluded1 && !anyNotIncluded2 && !allIncluded1 && allIncluded2)
        return 1;

      if (!anyNotIncluded1 && anyNotIncluded2 && !allIncluded1 && !allIncluded2)
        return 1;
      if (
        !anyNotIncluded1 &&
        !anyNotIncluded2 &&
        !allIncluded1 &&
        !allIncluded2
      )
        return -1;

      const size1 = precedences1.length;
      const size2 = precedences2.length;
      const res = size1 - size2;
      if (res === 0)
        throw new InternalError(
          `Unable to sort migration precedence between ${migration1.reference} and ${migration2.reference}. should not be possible`
        );
      return res;
    });
  }

  async migrate(
    qr?: any,
    adapter?: any,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<void> {
    const { ctxArgs, ctx, log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrate);
    // const qr = await this.getQueryRunner();
    let m: Migration<any, any>;
    const migrations: Migration<any, any>[] = Object.entries(
      Metadata.migrations()
    )
      .map(([flavour, migs]) =>
        migs.map((mig) => {
          try {
            log.silly(`loading migration ${mig.name} of flavour ${flavour}`);
            m = new mig();
            log.verbose(`migration ${m.reference} instantiated`, 1);
          } catch (e: unknown) {
            throw new InternalError(
              `failed to create migration ${mig.name}: ${e}`
            );
          }
          return m;
        })
      )
      .flat();

    let sortedMigrations: Migration<any, any>[];
    try {
      sortedMigrations = this.sort(migrations);
    } catch (e: unknown) {
      throw new InternalError(`Failed to sort migrations: ${e}`);
    }
    log.debug(
      `sorted migration before execution: ${sortedMigrations.map((s) => s.reference)}`
    );

    const breakOnError = ctx.get("breakOnHandlerError");

    for (const m of sortedMigrations) {
      let adapter: Adapter<any, any, any, any>;
      let qr: any;
      try {
        adapter = Adapter.get(m.flavour) as any;
        if (!adapter)
          throw new InternalError(
            `failed to create migration ${m.reference}. did you call Service.boot() or use the Persistence Service??`
          );
        qr = adapter.client;
      } catch (e: unknown) {
        if (breakOnError)
          throw new InternalError(
            `Failed to load ${m.flavour} adapter to migrate: ${e}`
          );
        log.warn(
          style(
            `Failed to load ${m.flavour} adapter to migrate. skipping ${m.reference}`
          ).red.bold
        );
        continue;
      }

      try {
        await m.up(qr, this, ...ctxArgs);
      } catch (e: unknown) {
        if (breakOnError)
          throw new MigrationError(
            `failed to initialize migration ${m.reference}: ${e}`
          );
        log.warn(
          style(`Failed to initialize migration ${m.reference}. skipping`).red
            .bold
        );
        continue;
      }
      try {
        await m.migrate(qr, this, ...ctxArgs);
      } catch (e: unknown) {
        if (breakOnError)
          throw new MigrationError(`failed to migrate ${m.reference}: ${e}`);
        log.warn(style(`Failed to migrate ${m.reference}. skipping`).red.bold);
        continue;
      }
      try {
        await m.down(qr, this, ...ctxArgs);
      } catch (e: unknown) {
        if (breakOnError)
          throw new MigrationError(
            `failed to conclude migration ${m.reference}: ${e}`
          );
        log.warn(
          style(`Failed to conclude migration ${m.reference}. skipping`).red
            .bold
        );
      }
    }
  }

  async up(
    qr: any,
    adapter: any,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    log.verbose(style("Setting up migration process").yellow.bold);
  }

  override async context(
    operation: ((...args: any[]) => any) | string,
    overrides: Partial<FlagsOf<Context<AdapterFlags>>>,
    ...args: any[]
  ): Promise<Context<AdapterFlags>> {
    const log = this.log.for(this.context);
    log.silly(
      `creating new context for ${operation} operation with flag overrides: ${JSON.stringify(overrides)}`
    );
    let ctx = args.pop();
    if (typeof ctx !== "undefined" && !(ctx instanceof Context)) {
      args.push(ctx);
      ctx = undefined;
    }

    const flags = await this.flags(
      typeof operation === "string" ? operation : operation.name,
      overrides as Partial<FlagsOf<any>>,
      ...args
    );
    if (ctx) {
      return new this.Context(ctx).accumulate({
        ...flags,
        parentContext: ctx,
      }) as any;
    }
    return new this.Context().accumulate(flags) as any;
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<ContextOf<A>, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<A>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<A>,
        ARGS,
        METHOD extends string ? true : false
      > {
    if (!this._client) {
      return ContextualLoggedClass.logCtx.call(
        this,
        operation,
        {}, // TODO check this
        allowCreate,
        ...args.filter((e) => typeof e !== "undefined")
      ) as
        | Promise<
            ContextualizedArgs<
              ContextOf<A>,
              ARGS,
              METHOD extends string ? true : false
            >
          >
        | ContextualizedArgs<
            ContextOf<A>,
            ARGS,
            METHOD extends string ? true : false
          >;
    }

    const ctx = this.client["logCtx"](
      args,
      operation,
      allowCreate as any,
      this.config as any
    ) as
      | ContextualizedArgs<
          ContextOf<A>,
          ARGS,
          METHOD extends string ? true : false
        >
      | Promise<
          ContextualizedArgs<
            ContextOf<A>,
            ARGS,
            METHOD extends string ? true : false
          >
        >;
    return ctx;
  }
}
