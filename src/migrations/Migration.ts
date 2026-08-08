import { Metadata } from "@decaf-ts/decoration";
import { ConnectionForAdapter, Migration, MigrationRule } from "./types";
import {
  AbsContextual,
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { prefixMethod } from "../utils/utils";
import { InternalError } from "@decaf-ts/db-decorators";
import { Adapter } from "../persistence/Adapter";
import { ContextOf, FlagsOf } from "../persistence/types";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationRuleError } from "../persistence/errors";
import { Context } from "../persistence/Context";

export abstract class AbsMigration<
  A extends Adapter<any, any, any, any>,
  R = void,
>
  extends AbsContextual<ContextOf<A>>
  implements Migration<A, R>
{
  private _reference?: string;
  private _precedence?: Migration<any, any> | string;

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

  protected abstract getQueryRunner(
    conn: ConnectionForAdapter<A>
  ): ConnectionForAdapter<A>;

  private async enforceRules(
    qr: ConnectionForAdapter<A>,
    adapter: A,
    ctx: ContextOf<A>
  ) {
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
      this: AbsMigration<A, ConnectionForAdapter<A>>,
      qrOrAdapter: ConnectionForAdapter<A> | A,
      ...args: MaybeContextualArg<ContextOf<A>>
    ): Promise<[ConnectionForAdapter<A>, A, ContextOf<A>]> {
      let qr: ConnectionForAdapter<A>;
      if (qrOrAdapter instanceof Adapter) {
        qr = this.getQueryRunner(qrOrAdapter.client);
      } else {
        qr = qrOrAdapter;
        qrOrAdapter = this.adapter;
      }
      const { ctx, log } = await this.logCtx(
        [name, ...args],
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
    qr: ConnectionForAdapter<A>,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;

  abstract migrate(
    qr: ConnectionForAdapter<A>,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<R>;

  abstract up(
    qr: ConnectionForAdapter<A>,
    adapter: A,
    ctx: ContextOf<A>
  ): Promise<void>;

  protected override logCtx<
    CONTEXT extends Context<any> = ContextOf<A>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    CONTEXT extends Context<any> = ContextOf<A>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<ContextOf<A>>>
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    CONTEXT extends Context<any> = ContextOf<A>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<ContextOf<any>>>
  ): Promise<
    ContextualizedArgs<
      ContextOf<A>,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    CONTEXT extends Context<any> = ContextOf<A>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false,
    overrides?: Partial<FlagsOf<ContextOf<A>>>
  ):
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
      > {
    let adapter: Adapter<any, any, any> | undefined;
    try {
      adapter = this["adapter"];
    } catch {
      adapter = undefined;
    }

    if (!allowCreate || !adapter)
      return super.logCtx(
        args,
        operation,
        allowCreate as any,
        overrides as any
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

    return adapter
      .context(
        typeof operation === "string" ? operation : operation.name,
        overrides || ({} as Partial<FlagsOf<ContextOf<A>>>),
        undefined as any,
        ...args
      )
      .then((ctx) =>
        super.logCtx(
          [typeof operation === "string" ? operation : operation.name, ...args.slice(0, -1), ctx] as any,
          PersistenceKeys.MIGRATION,
          false,
          overrides as any
        )
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
  }
}
