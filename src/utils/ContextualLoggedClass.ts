import { LoggedClass } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";
import { Context } from "../persistence/Context";
import { LoggerOf } from "../persistence/index";

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

  protected logCtx<ARGS extends any[]>(
    args: ARGS,
    method: ((...args: any[]) => any) | string
  ): ContextualizedArgs<any, ARGS> {
    return ContextualLoggedClass.logCtx.call(
      this,
      args,
      method as any
    ) as ContextualizedArgs<C, ARGS>;
  }

  protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: string
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: (...args: any[]) => any
  ): ContextualizedArgs<CONTEXT, ARGS>;
  protected static logCtx<CONTEXT extends Context<any>, ARGS extends any[]>(
    this: any,
    args: ARGS,
    method: ((...args: any[]) => any) | string
  ): ContextualizedArgs<CONTEXT, ARGS> {
    if (args.length < 1) throw new InternalError("No context provided");
    const ctx = args.pop() as CONTEXT;
    if (!(ctx instanceof Context))
      throw new InternalError("No context provided");
    if (args.filter((a) => a instanceof Context).length > 1)
      throw new Error("here");
    const log = (
      this
        ? ctx.logger.for(this).for(method)
        : ctx.logger.clear().for(this).for(method)
    ) as LoggerOf<CONTEXT>;
    return {
      ctx: ctx,
      log: method ? (log.for(method) as LoggerOf<CONTEXT>) : log,
      ctxArgs: [...args, ctx],
    };
  }
}
