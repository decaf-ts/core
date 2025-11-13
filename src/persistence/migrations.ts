import { Migration } from "./types";
import { Adapter } from "./Adapter";
import {
  Context,
  InternalError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { LoggedClass, Logger } from "@decaf-ts/logging";
import { Decoration } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";
import { Metadata, metadata } from "@decaf-ts/decoration";
import { MigrationRuleError } from "./errors";

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

export abstract class AbsMigration<
    A extends Adapter<CONF, CONN, QUERY, FLAGS, CONTEXT>,
    CONF,
    CONN,
    QUERY,
    QUERYRUNNER = CONN,
    FLAGS extends RepositoryFlags = RepositoryFlags,
    CONTEXT extends Context<FLAGS> = Context<FLAGS>,
  >
  extends LoggedClass
  implements Migration<QUERYRUNNER, A, CONF, CONN, QUERY, FLAGS, CONTEXT>
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

  protected abstract getQueryRunner(conn: CONN): QUERYRUNNER;

  private async enforceRules(qr: QUERYRUNNER, adapter: A, l: Logger) {
    const rules: MigrationRule<
      A,
      CONF,
      CONN,
      QUERY,
      QUERYRUNNER,
      FLAGS,
      CONTEXT
    >[] = Metadata.get(
      this.constructor as any,
      PersistenceKeys.MIGRATION
    )?.rules;
    if (!rules || !rules.length) return true;
    let log: Logger;
    for (const rule of rules) {
      log = l.for(rule);
      const result = await rule(qr, adapter, log);
      if (!result) return false;
    }
    return true;
  }

  private prefix(name: string) {
    return async function preffix(
      this: AbsMigration<A, CONF, CONN, QUERY, QUERYRUNNER, FLAGS, CONTEXT>,
      qrOrAdapter: QUERYRUNNER | A
    ): Promise<[QUERYRUNNER, A, Logger]> {
      let qr: QUERYRUNNER;
      if (qrOrAdapter instanceof Adapter) {
        qr = this.getQueryRunner(qrOrAdapter.client);
      } else {
        qr = qrOrAdapter;
        qrOrAdapter = this.adapter;
      }
      const log = this.log.for(name);
      const allowed = await this.enforceRules(qr, qrOrAdapter as A, log);
      if (!allowed) {
        log.verbose(`Skipping migration ${this.constructor.name} due to rules`);
        throw new MigrationRuleError("Migration skipped for rule enforcement");
      }
      return [qr, qrOrAdapter, log];
    }.bind(this);
  }

  abstract down(qr: QUERYRUNNER, adapter: A, log: Logger): Promise<void>;

  abstract up(qr: QUERYRUNNER, adapter: A, log: Logger): Promise<void>;
}

export type MigrationRule<
  A extends Adapter<CONF, CONN, QUERY, FLAGS, CONTEXT> = any,
  CONF = any,
  CONN = any,
  QUERY = any,
  QUERYRUNNER = CONN,
  FLAGS extends RepositoryFlags = RepositoryFlags,
  CONTEXT extends Context<FLAGS> = Context<FLAGS>,
> = (qr: QUERYRUNNER, adapter: A, log: Logger) => Promise<boolean>;

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
