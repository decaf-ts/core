import { Metadata } from "@decaf-ts/decoration";
import { ConnectionForAdapter, Migration, MigrationRule } from "./types";
import { AbsContextual, ContextualArgs } from "../utils/ContextualLoggedClass";
import { prefixMethod } from "../utils/utils";
import { InternalError } from "@decaf-ts/db-decorators";
import { Adapter } from "../persistence/Adapter";
import { ContextOf } from "../persistence/types";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationRuleError } from "../persistence/errors";

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
    if (!this._reference) {
      const meta = Metadata.get(
        this.constructor as any,
        PersistenceKeys.MIGRATION
      );
      this._reference = meta.reference;
      if (!this._reference)
        throw new InternalError(
          `No precedence defined for ${this.constructor.name}. did you use @migration()?`
        );
    }
    return this._reference;
  }

  get precedence() {
    if (typeof this._precedence === "undefined") {
      const meta = Metadata.get(
        this.constructor as any,
        PersistenceKeys.MIGRATION
      );
      this._precedence = meta.precedence;
      if (!this._precedence)
        throw new InternalError(
          `No precedence defined for ${this.constructor.name}. did you use @migration()?`
        );
    }
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
