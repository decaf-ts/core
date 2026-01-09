import { LoggedClass } from "@decaf-ts/logging";
import {
  Contextual,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Context } from "../persistence/Context";
import { FlagsOf, LoggerOf } from "../persistence/types";
import type { Constructor } from "@decaf-ts/decoration";
import { ModelConstructor } from "@decaf-ts/decorator-validation";

export type ContextualArgs<
  C extends Context<any>,
  ARGS extends any[] = any[],
> = [...ARGS, C];

export type MaybeContextualArg<
  C extends Context<any>,
  ARGS extends any[] = any[],
> = any[] | ContextualArgs<C, ARGS>;

export type ContextualizedArgs<
  C extends Context<any>,
  ARGS extends any[] = any[],
> = {
  ctx: C;
  log: LoggerOf<C>;
  ctxArgs: ContextualArgs<C, ARGS>;
};

export abstract class ContextualLoggedClass<
  C extends Context<any>,
> extends LoggedClass {
  protected logFrom(
    ctx: Context<any>,
    method?: string | keyof this | ((...args: any[]) => any)
  ) {
    return ContextualLoggedClass.logFrom.call(this, ctx, method as any);
  }

  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: ((...args: any[]) => any) | string
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: ((...args: any[]) => any) | string,
    allowCreate: false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: ((...args: any[]) => any) | string,
    allowCreate: true,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<ContextualizedArgs<CONTEXT, ARGS>>;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    CREATE extends boolean = false,
    ARGS extends any[] = any[],
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: ((...args: any[]) => any) | string,
    allowCreate: CREATE = false as CREATE,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ):
    | Promise<ContextualizedArgs<CONTEXT, ARGS>>
    | ContextualizedArgs<CONTEXT, ARGS> {
    return ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...args.filter((e) => typeof e !== "undefined")
    ) as
      | Promise<ContextualizedArgs<CONTEXT, ARGS>>
      | ContextualizedArgs<CONTEXT, ARGS>;
  }

  static logFrom<CONTEXT extends Context<any>, A = any>(
    this: A,
    ctx: CONTEXT,
    method?: string | keyof A | ((...args: any[]) => any)
  ) {
    const log = (
      (this as unknown as Contextual)["context"]
        ? ctx.logger.for(this as any)
        : ctx.logger.clear().for(this as any)
    ) as LoggerOf<CONTEXT>;
    return method ? log.for(method as any) : log;
  }

  static logCtx<CONTEXT extends Context<any>, ARGS extends any[] = any[]>(
    this: any,
    operation: ((...args: any[]) => any) | string,
    ...args: MaybeContextualArg<CONTEXT, ARGS>
  ): ContextualizedArgs<CONTEXT, ARGS>;
  static logCtx<
    CONTEXT extends Context<any>,
    CREATE extends boolean,
    CONTEXTUAL extends Contextual<CONTEXT> | any,
    ARGS extends any[] = any[],
  >(
    this: CONTEXTUAL,
    operation: ((...args: any[]) => any) | string,
    overrides: Partial<FlagsOf<CONTEXT>> | undefined,
    allowCreate: CREATE = false as CREATE,
    ...args: MaybeContextualArg<CONTEXT, ARGS>
  ): CREATE extends true
    ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
    : ContextualizedArgs<CONTEXT, ARGS> {
    const bootCtx = async function bootCtx(
      this: CONTEXTUAL,
      ...args: MaybeContextualArg<CONTEXT>
    ) {
      if (!this) throw new InternalError("No contextual provided");
      if (!(this as any)["context"])
        throw new InternalError("Invalid contextual provided");
      return (this as unknown as Contextual<CONTEXT>).context(
        typeof operation === "string" ? operation : operation.name,
        overrides || ({} as Partial<FlagsOf<CONTEXT>>),
        ...args
      );
    };

    const ctx: any = args.pop();
    const hasContext = ctx instanceof Context;
    if (!allowCreate && !hasContext)
      throw new InternalError("No context provided");
    if (hasContext && !allowCreate) {
      return {
        log: ContextualLoggedClass.logFrom.call(this, ctx),
        ctx: ctx,
        ctxArgs: [...args, ctx],
      } as CREATE extends true
        ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
        : ContextualizedArgs<CONTEXT, ARGS>;
    }
    return bootCtx.call(this, ...args, ctx).then((resp) => {
      return {
        log: ContextualLoggedClass.logFrom.call(this, resp),
        ctx: resp,
        ctxArgs: [...args, resp],
      };
    }) as CREATE extends true
      ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
      : ContextualizedArgs<CONTEXT, ARGS>;
  }
}

export abstract class AbsContextual<C extends Context<any>>
  extends ContextualLoggedClass<C>
  implements Contextual<C>
{
  protected constructor() {
    super();
  }

  /**
   * @description The context constructor for this adapter
   * @summary Reference to the context class constructor used by this adapter
   */
  private readonly _Context: Constructor<C> = Context<
    FlagsOf<C>
  > as unknown as Constructor<C>;
  protected get Context(): Constructor<C> {
    return this._Context;
  }

  async context(
    operation:
      | ((...args: any[]) => any)
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FlagsOf<C>>,
    ...args: MaybeContextualArg<Context<any>, any[]>
  ): Promise<C> {
    const log = this.log.for(this.context);
    log.debug(
      `Creating new context for ${typeof operation === "string" ? operation : operation.name} operation with flag overrides: ${Object.keys(overrides)}`
    );
    let ctx = args.pop();
    if (!(ctx instanceof Context)) {
      args.push(ctx);
      ctx = undefined;
    }

    if (ctx && !(ctx instanceof this.Context))
      return new this.Context(ctx).accumulate(overrides) as C;
    return new this.Context().accumulate(overrides) as C;
  }
}
