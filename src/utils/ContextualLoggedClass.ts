import { LoggedClass } from "@decaf-ts/logging";
import { Context, InternalError } from "@decaf-ts/db-decorators";
import { LoggerOf } from "../persistence/index";

export abstract class ContextualLoggedClass<
  C extends Context<any>,
> extends LoggedClass {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected logFor(ctx: C, ...args: any[]): LoggerOf<C> {
    return ctx.logger.for(this) as LoggerOf<C>;
  }

  protected logCtx(
    args: any[],
    method: ((...args: any[]) => any) | string
  ): { ctx: C; log: LoggerOf<C> } {
    return ContextualLoggedClass.logCtx.call(this, args, method as any) as {
      ctx: C;
      log: LoggerOf<C>;
    };
  }

  protected static logCtx<CONTEXT extends Context<any>>(
    this: any,
    args: any[],
    method: string
  ): { ctx: CONTEXT; log: LoggerOf<CONTEXT> };
  protected static logCtx<CONTEXT extends Context<any>>(
    this: any,
    args: any[],
    method: (...args: any[]) => any
  ): { ctx: CONTEXT; log: LoggerOf<CONTEXT> };
  protected static logCtx<CONTEXT extends Context<any>>(
    this: any,
    args: any[],
    method: ((...args: any[]) => any) | string
  ): { ctx: CONTEXT; log: LoggerOf<CONTEXT> } {
    if (args.length < 1) throw new InternalError("No context provided");
    const ctx = args[args.length - 1] as CONTEXT;
    if (!(ctx instanceof Context))
      throw new InternalError("No context provided");

    const log = (this ? ctx.logger.for(this) : ctx.logger) as LoggerOf<CONTEXT>;
    return {
      ctx: ctx,
      log: method ? (log.for(method) as LoggerOf<CONTEXT>) : log,
    };
  }
}
