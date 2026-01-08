import { LoggedClass } from "@decaf-ts/logging";
import {
  Contextual,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Context } from "../persistence/Context";
import { FlagsOf, LoggerOf } from "../persistence/types";
import type { Constructor } from "@decaf-ts/decoration";

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected logFor(ctx: C, ...args: any[]): LoggerOf<C> {
    return ctx.logger.for(this) as LoggerOf<C>;
  }
  //
  // protected logCtx<ARGS extends any[]>(
  //   args: ARGS,
  //   method: ((...args: any[]) => any) | string
  // ): ContextualizedArgs<any, ARGS> {
  //   return ContextualLoggedClass.logCtx.call(
  //     this,
  //     args,
  //     method as any
  //   ) as ContextualizedArgs<C, ARGS>;
  // }

  protected logCtx<CONTEXT extends Context<any>, ARGS extends any[] = any[]>(
    args: ARGS | [...ARGS, Context<any>],
    operation: (...args: any[]) => any | string
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected logCtx<CONTEXT extends Context<any>, ARGS extends any[] = any[]>(
    args: ARGS | [...ARGS, Context<any>],
    operation: (...args: any[]) => any | string,
    allowCreate: false
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected logCtx<CONTEXT extends Context<any>, ARGS extends any[] = any[]>(
    args: ARGS | [...ARGS, Context<any>],
    operation: (...args: any[]) => any | string,
    allowCreate: true
  ): Promise<ContextualizedArgs<CONTEXT, ARGS>>;
  protected logCtx<
    CONTEXT extends Context<any>,
    CREATE extends boolean,
    ARGS extends any[] = any[],
  >(
    args: ARGS | [...ARGS, Context<any>],
    operation: (...args: any[]) => any | string,
    allowCreate: CREATE = false as CREATE
  ):
    | Promise<ContextualizedArgs<CONTEXT, ARGS>>
    | ContextualizedArgs<CONTEXT, ARGS> {
    return ContextualLoggedClass.logCtx.call(
      this,
      operation as any,
      {} as Partial<FlagsOf<CONTEXT>>,
      allowCreate,
      ...args
    ) as
      | Promise<ContextualizedArgs<CONTEXT, ARGS>>
      | ContextualizedArgs<CONTEXT, ARGS>;
  }

  protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
    this: any,
    operation: (...args: any[]) => any | string,
    ...args: ARGS | [...ARGS, Context<any>]
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected static logCtx<
    CONTEXT extends Context<any>,
    CREATE extends boolean,
    CONTEXTUAL extends Contextual<CONTEXT> | any,
    ARGS extends any[] = any[],
  >(
    this: CONTEXTUAL,
    operation: (...args: any[]) => any | string,
    overrides: Partial<FlagsOf<CONTEXT>> | undefined,
    allowCreate: CREATE = false as CREATE,
    ...args: ARGS | [...ARGS, Context<any>]
  ): CREATE extends true
    ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
    : ContextualizedArgs<CONTEXT, ARGS> {
    const bootCtx = async function bootCtx(
      this: CONTEXTUAL,
      ctx?: Context<any>
    ) {
      if (!this) throw new InternalError("No contextual provided");
      if (!(this as any)["context"])
        throw new InternalError("Invalid contextual provided");
      return (this as unknown as Contextual<CONTEXT>).context(
        typeof operation === "string" ? operation : operation.name,
        overrides || {},
        ctx
      );
    };

    const confLogger = function (this: CONTEXTUAL, ctx: Context<any>) {
      const log = (
        (this as Contextual)["context"]
          ? ctx.logger.for(this as any).for(operation)
          : ctx.logger.clear().for(operation)
      ) as LoggerOf<CONTEXT>;
      return log;
    };

    const ctx: any = args.pop();
    const hasContext = ctx instanceof Context;
    if (!allowCreate && !hasContext)
      throw new InternalError("No context provided");
    if (hasContext && !allowCreate) {
      return {
        log: confLogger.call(this, ctx),
        ctx: ctx,
        ctxArgs: [...args, ctx],
      } as CREATE extends true
        ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
        : ContextualizedArgs<CONTEXT, ARGS>;
    }
    return bootCtx.call(this, ctx).then((resp) => {
      return {
        log: confLogger.call(this, resp),
        ctx: resp,
        ctxArgs: [...args, resp],
      };
    }) as CREATE extends true
      ? Promise<ContextualizedArgs<CONTEXT, ARGS>>
      : ContextualizedArgs<CONTEXT, ARGS>;
  }
  //
  // protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: string
  // ): ContextualizedArgs<CONTEXT, ARGS>;
  // protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: (...args: any[]) => any
  // ): ContextualizedArgs<CONTEXT, ARGS>;
  // protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
  //   this: any,
  //   args: ARGS,
  //   method: ((...args: any[]) => any) | string
  // ): ContextualizedArgs<CONTEXT, ARGS> {
  //   if (args.length < 1) throw new InternalError("No context provided");
  //   const ctx = args.pop() as CONTEXT;
  //   if (!(ctx instanceof BaseContext))
  //     throw new InternalError("No context provided");
  //   if (args.filter((a) => a instanceof BaseContext).length > 1)
  //     throw new Error("here");
  //   const log = (
  //     this
  //       ? ctx.logger.for(this).for(method)
  //       : ctx.logger.clear().for(this).for(method)
  //   ) as LoggerOf<CONTEXT>;
  //   return {
  //     ctx: ctx,
  //     log: method ? (log.for(method) as LoggerOf<CONTEXT>) : log,
  //     ctxArgs: [...args, ctx],
  //   };
  // }
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
  protected readonly Context: Constructor<C> = Context<
    FlagsOf<C>
  > as unknown as Constructor<C>;

  async context(
    operation:
      | ((...args: any[]) => any)
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FlagsOf<C>>,
    ...args: any[] | [...any[], Context<any>]
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
