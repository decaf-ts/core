import { AdapterFlags, ContextOf, Migration } from "./types";
import { Adapter } from "./Adapter";
import { InternalError } from "@decaf-ts/db-decorators";
import { DefaultAdapterFlags, PersistenceKeys } from "./constants";
import {
  Constructor,
  Decoration,
  DefaultFlavour,
  Metadata,
  metadata,
} from "@decaf-ts/decoration";
import { MigrationError, MigrationRuleError } from "./errors";
import {
  AbsContextual,
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { ClientBasedService } from "../services/services";
import { style } from "@decaf-ts/logging";

export function prefixMethod(
  obj: any,
  after: (...args: any[]) => any,
  prefix: (...args: any[]) => any,
  afterName?: string
) {
  async function wrapper(this: any, ...args: any[]) {
    let results: any[];
    try {
      results = await Promise.resolve(prefix.call(this, ...args));
    } catch (e: unknown) {
      if (e instanceof MigrationRuleError) return;
      throw e;
    }
    return Promise.resolve(after.apply(this, results));
  }

  const wrapped = wrapper.bind(obj);
  const name = afterName ? afterName : after.name;
  Object.defineProperty(wrapped, "name", {
    enumerable: true,
    configurable: true,
    writable: false,
    value: name,
  });
  obj[name] = wrapped;
}

export type ConnectionForAdapter<A extends Adapter<any, any, any, any>> =
  A extends Adapter<any, any, infer CONN, any> ? CONN : never;

export abstract class AbsMigration<
    A extends Adapter<any, any, any, any>,
    QUERYRUNNER = ConnectionForAdapter<A>,
  >
  extends AbsContextual<ContextOf<A>>
  implements Migration<QUERYRUNNER, A>
{
  private _reference?: string;
  private _precedence?: Migration<any, any>;

  transaction = true;

  get reference() {
    if (!this._reference)
      throw new InternalError(
        `No reference defined for ${this.constructor.name}. did you use @migration()?`
      );
    return this._reference;
  }

  get precedence() {
    if (typeof this._precedence === "undefined")
      throw new InternalError(
        `No precedence defined for ${this.constructor.name}. did you use @migration()?`
      );
    return this._precedence;
  }

  protected constructor() {
    super();
    [this.up, this.down].forEach((m) => {
      const name = m.name;
      prefixMethod(this, m, this.prefix(name));
    });
  }

  protected get adapter(): A {
    const meta = Metadata.get(
      this.constructor as any,
      PersistenceKeys.MIGRATION
    );
    if (!meta)
      throw new InternalError(
        `No migration metadata for ${this.constructor.name}`
      );
    const flavour: string = meta.flavour;
    return Adapter.get(flavour) as A;
  }

  protected abstract getQueryRunner(conn: ConnectionForAdapter<A>): QUERYRUNNER;

  private async enforceRules(qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>) {
    const rules: MigrationRule<any, any>[] = Metadata.get(
      this.constructor as any,
      PersistenceKeys.MIGRATION
    )?.rules;
    if (!rules || !rules.length) return true;
    for (const rule of rules) {
      const result = await rule(qr, adapter, ctx);
      if (!result) return false;
    }
    return true;
  }

  private prefix(name: string) {
    return async function preffix(
      this: AbsMigration<A, QUERYRUNNER>,
      qrOrAdapter: QUERYRUNNER | A
    ): Promise<[QUERYRUNNER, A, ContextOf<A>]> {
      let qr: QUERYRUNNER;
      if (qrOrAdapter instanceof Adapter) {
        qr = this.getQueryRunner(qrOrAdapter.client);
      } else {
        qr = qrOrAdapter;
        qrOrAdapter = this.adapter;
      }
      const { ctx, log } = await this.logCtx(
        [name],
        PersistenceKeys.MIGRATION,
        true
      );
      const allowed = await this.enforceRules(
        qr,
        qrOrAdapter as A,
        ctx as ContextOf<A>
      );
      if (!allowed) {
        log.verbose(`Skipping migration ${this.constructor.name} due to rules`);
        throw new MigrationRuleError("Migration skipped for rule enforcement");
      }
      return [qr, qrOrAdapter, ctx as ContextOf<A>];
    }.bind(this);
  }

  abstract down(
    qr: QUERYRUNNER,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;

  abstract migrate(
    qr: QUERYRUNNER,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;

  abstract up(qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>): Promise<void>;
}

export type MigrationRule<
  A extends Adapter<any, any, any, any> = any,
  QUERYRUNNER = ConnectionForAdapter<A>,
> = (qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>) => Promise<boolean>;

export type MigrationMetadata = {
  precedence?: Migration<any, any>;
  flavour: string;
  rules?: MigrationRule[];
};

export function migration(): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>> | null
): (target: object) => any;
export function migration(flavour: string): (target: object) => any;
export function migration(
  flavour: string,
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>>,
  flavour: string
): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>>,
  flavour: string,
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
  precedence?: Constructor<Migration<any, any>> | string | null,
  flavour?: string | MigrationRule[],
  rules?: MigrationRule[]
): (target: object) => any {
  function innerMigration(
    precedence?: Constructor<Migration<any, any>> | string | null,
    flavour?: string | MigrationRule[],
    rules?: MigrationRule[]
  ): (original: object) => void {
    return function (original: object) {
      if (flavour && typeof flavour !== "string") {
        if (flavour && Array.isArray(flavour)) {
          rules = flavour;
          flavour = undefined;
        }
      }

      if (typeof precedence === "string") {
        flavour = precedence;
        precedence = undefined;
      }

      if (typeof precedence === "undefined" && precedence !== null)
        precedence = MigrationService;

      flavour =
        flavour ||
        Metadata.flavourOf(original as Constructor) ||
        (precedence === null ? flavour : undefined) ||
        undefined;

      const current =
        Metadata["innerGet"](
          Symbol.for(PersistenceKeys.MIGRATION),
          flavour || DefaultFlavour
        ) || [];
      Metadata.set(PersistenceKeys.MIGRATION, flavour || DefaultFlavour, [
        ...current,
        {
          class: original,
        },
      ]);
      return metadata(PersistenceKeys.MIGRATION, {
        precedence: precedence,
        flavour: flavour || DefaultFlavour,
        rules: rules,
      })(original);
    };
  }

  return Decoration.for(PersistenceKeys.MIGRATION)
    .define({
      decorator: innerMigration,
      args: [precedence, flavour, rules],
    })
    .apply();
}

export type MigrationConfig<PERSIST extends boolean> = AdapterFlags<any> & {
  persistMigrationSteps: PERSIST;
  persistenceFlavour?: string;
};

export const DefaultMigrationConfig: MigrationConfig<true> = Object.assign(
  {},
  DefaultAdapterFlags,
  {
    persistMigrationSteps: true,
  }
) as MigrationConfig<true>;

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
  readonly reference: string = "";
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
    qr: any,
    adapter: any,
    migrations: Constructor<Migration<any, any>>[],
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { ctxArgs, ctx, log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrate);
    // const qr = await this.getQueryRunner();
    let m: Migration<any, any>;
    const breakOnError = ctx.get("breakOnError");
    const migs: Record<string, Constructor<Migration<any, any>>> = Metadata[
      "innerGet"
    ](Symbol.for(PersistenceKeys.MIGRATION));
    for (const [, migration] of Object.entries(migs)) {
      try {
        m = new migration();
        log.silly(`migration ${m.reference} instantiated`);
      } catch (e: unknown) {
        throw new InternalError(
          `failed to create migration ${migration.name}: ${e}`
        );
      }

      let adapter: Adapter<any, any, any, any>;
      let qr: any;
      try {
        adapter = Adapter.get(m.flavour) as any;
        if (!adapter)
          throw new InternalError(
            `failed to create migration ${m.reference}. did you call Service.boot()?`
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
    if (!this.client) {
      return super.logCtx(args, operation, false) as any;
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
