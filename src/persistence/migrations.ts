import { ContextOf, Migration } from "./types";
import { Adapter } from "./Adapter";
import { InternalError } from "@decaf-ts/db-decorators";
import { LoggedClass } from "@decaf-ts/logging";
import { PersistenceKeys } from "./constants";
import { Decoration, Metadata, metadata } from "@decaf-ts/decoration";
import { MigrationRuleError } from "./errors";
import { Model } from "@decaf-ts/decorator-validation";
import { Context } from "./Context";

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
  extends LoggedClass
  implements Migration<QUERYRUNNER, A>
{
  transaction = true;

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
      const ctx = await Context.args<any, ContextOf<A>>(
        "migration",
        Model as any,
        [name],
        qrOrAdapter
      );
      const allowed = await this.enforceRules(
        qr,
        qrOrAdapter as A,
        ctx.context
      );
      if (!allowed) {
        ctx.context.logger.verbose(
          `Skipping migration ${this.constructor.name} due to rules`
        );
        throw new MigrationRuleError("Migration skipped for rule enforcement");
      }
      return [qr, qrOrAdapter, ctx.context];
    }.bind(this);
  }

  abstract down(qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>): Promise<void>;

  abstract up(qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>): Promise<void>;
}

export type MigrationRule<
  A extends Adapter<any, any, any, any> = any,
  QUERYRUNNER = ConnectionForAdapter<A>,
> = (qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>) => Promise<boolean>;

export type MigrationMetadata = {
  flavour: string;
  rules?: MigrationRule[];
};

export function migration(flavour: string, rules?: MigrationRule[]) {
  function innerMigration(flavour: string, rules?: MigrationRule[]) {
    return function (original: object) {
      const current =
        Metadata["innerGet"](Symbol.for(PersistenceKeys.MIGRATION), flavour) ||
        [];
      Metadata.set(PersistenceKeys.MIGRATION, flavour, [
        ...current,
        {
          class: original,
        },
      ]);
      return metadata(PersistenceKeys.MIGRATION, {
        flavour: flavour,
        rules: rules,
      })(original);
    };
  }

  return Decoration.for(PersistenceKeys.MIGRATION)
    .define({
      decorator: innerMigration,
      args: [flavour, rules],
    })
    .apply();
}
