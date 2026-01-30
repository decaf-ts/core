import { DefaultMigrationConfig } from "./constants";
import { Migration, MigrationConfig } from "./types";
import { ClientBasedService, Service } from "../services/services";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationError } from "../persistence/errors";
import { ContextOf } from "../persistence/types";
import {
  ContextualArgs,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { style } from "@decaf-ts/logging";
import { DefaultFlavour, Metadata } from "@decaf-ts/decoration";
import { InternalError } from "@decaf-ts/db-decorators";

export class MigrationService<
    PERSIST extends boolean,
    A extends Adapter<any, any, any, any> = any,
    R = void,
  >
  extends ClientBasedService<
    PERSIST extends boolean ? A : void,
    MigrationConfig<PERSIST>
  >
  implements Migration<any, A, R>
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
    const { log, ctx } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);

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
      if (res === 0) {
        if (migration1.reference === migration2.reference)
          throw new InternalError(
            `Unable to sort migration precedence between ${migration1.reference} and ${migration2.reference}. should not be possible`
          );
        return migration1.reference.localeCompare(migration2.reference);
      }

      return res;
    });
  }

  async migrate(
    qr?: any,
    adapter?: any,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<R> {
    const { ctxArgs, log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrate);
    let m: Migration<any, any>;

    const toBoot = Metadata.migrations();
    const migrations: Migration<any, any>[] = [];
    for (const [reference, mig] of toBoot) {
      try {
        log.silly(`loading migration ${reference}...`);
        m = new mig();
        log.verbose(`migration ${m.reference} instantiated`, 1);
      } catch (e: unknown) {
        throw new InternalError(`failed to create migration ${mig.name}: ${e}`);
      }
      migrations.push(m);
    }

    let sortedMigrations: Migration<any, any>[];
    try {
      sortedMigrations = this.sort(migrations);
    } catch (e: unknown) {
      throw new InternalError(`Failed to sort migrations: ${e}`);
    }
    log.debug(
      `sorted migration before execution: ${sortedMigrations.map((s) => s.reference)}`
    );

    for (const m of sortedMigrations) {
      let adapter: Adapter<any, any, any, any>;
      let qr: any;
      try {
        const meta = Metadata.get(
          m.constructor as any,
          PersistenceKeys.MIGRATION
        );
        const flavour = meta?.flavour || m.flavour;
        adapter = Adapter.get(flavour) as any;
        if (!adapter)
          throw new InternalError(
            `failed to create migration ${m.reference}. did you call Service.boot() or use the Persistence Service??`
          );
        qr = adapter.client;
      } catch (e: unknown) {
        throw new InternalError(
          `Failed to load adapter to migrate ${m.reference}: ${e}`
        );
      }

      try {
        await m.up(qr, adapter, ...ctxArgs);
      } catch (e: unknown) {
        throw new MigrationError(
          `failed to initialize migration ${m.reference}: ${e}`
        );
      }
      try {
        await m.migrate(qr, adapter, ...ctxArgs);
      } catch (e: unknown) {
        throw new MigrationError(`failed to migrate ${m.reference}: ${e}`);
      }
      try {
        await m.down(qr, adapter, ...ctxArgs);
      } catch (e: unknown) {
        throw new MigrationError(
          `failed to conclude migration ${m.reference}: ${e}`
        );
      }
    }
    return undefined as unknown as R;
  }

  async up(
    qr: any,
    adapter: any,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    log.verbose(style("Setting up migration process").yellow.bold);
  }
}

const current =
  Metadata["innerGet"](Symbol.for(PersistenceKeys.MIGRATION), DefaultFlavour) ||
  [];

Metadata.set(PersistenceKeys.MIGRATION, DefaultFlavour, [
  ...current,
  MigrationService,
]);
