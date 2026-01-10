import { LoggedClass, Logger } from "@decaf-ts/logging";
import {
  BulkCrudOperationKeys,
  Contextual,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Context } from "../persistence/Context";
import { FlagsOf, LoggerOf } from "../persistence/types";
import type { Constructor } from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/index";
import { PreparedStatementKeys } from "../query/index";

export type ContextualArgs<
  C extends Context<any>,
  ARGS extends any[] = any[],
> = [...ARGS, C];

export type MethodOrOperation =
  | ((...args: any[]) => any)
  | string
  | OperationKeys
  | PersistenceKeys
  | BulkCrudOperationKeys
  | PreparedStatementKeys;

export type MaybeContextualArg<
  C extends Context<any>,
  ARGS extends any[] = any[],
> = any[] | ContextualArgs<C, ARGS>;

export type ContextualizedArgs<
  C extends Context<any>,
  ARGS extends any[] = any[],
  EXTEND extends boolean = false,
> = EXTEND extends true
  ? {
      ctx: C;
      log: LoggerOf<C>;
      ctxArgs: ContextualArgs<C, ARGS>;
      for: (...any: any[]) => ContextualizedArgs<C, ARGS, false>;
    }
  : {
      ctx: C;
      log: LoggerOf<C>;
      ctxArgs: ContextualArgs<C, ARGS>;
    };

export abstract class ContextualLoggedClass<
  C extends Context<any>,
> extends LoggedClass {
  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<
    ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
  >;
  protected logCtx<
    CONTEXT extends Context<any> = C,
    CREATE extends boolean = false,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: CREATE = false as CREATE,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ):
    | Promise<
        ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
      >
    | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false> {
    return ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...args.filter((e) => typeof e !== "undefined")
    ) as
      | Promise<
          ContextualizedArgs<
            CONTEXT,
            ARGS,
            METHOD extends string ? true : false
          >
        >
      | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  }

  static logFrom<
    CONTEXT extends Context<any>,
    A = any | Contextual<CONTEXT>,
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    obj: A,
    logger: LoggerOf<any>,
    ctx: CONTEXT,
    method?: METHOD | keyof A
  ): Logger {
    const log = (obj as Contextual)["context"]
      ? logger.clear().for(obj as any) // Reset for Contextuals
      : logger.for(obj);
    // const log = (
    //   (this as unknown as Contextual)["context"]
    //     ? ctx.logger.for(this as any)
    //     : ctx.logger.clear().for(this as any)
    // ) as LoggerOf<CONTEXT>;
    return (method ? log.for(method as any) : log) as Logger;
  }

  static logCtx<
    CONTEXT extends Context<any>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    this: any,
    operation: METHOD,
    ...args: MaybeContextualArg<CONTEXT, ARGS>
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  static logCtx<
    CONTEXT extends Context<any>,
    CREATE extends boolean,
    CONTEXTUAL extends Contextual<CONTEXT> | any,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    this: CONTEXTUAL,
    operation: METHOD,
    overrides: Partial<FlagsOf<CONTEXT>> | undefined,
    allowCreate: CREATE = false as CREATE,
    ...args: MaybeContextualArg<CONTEXT, ARGS>
  ): CREATE extends true
    ? Promise<
        ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
      >
    : ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false> {
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

    const response = (
      obj: CONTEXTUAL | any,
      resp: ContextualizedArgs<CONTEXT, ARGS>,
      op: METHOD
    ): METHOD extends string
      ? ContextualizedArgs<CONTEXT, ARGS, true>
      : ContextualizedArgs<CONTEXT, ARGS> => {
      // resp.log = ContextualLoggedClass.logFrom(obj, resp.log, ctx, op) as any;
      resp.log = obj.context
        ? resp.log.clear().for(obj) // Reset for Contextuals
        : resp.log.for(obj);

      if (typeof op === "string") {
        (resp as ContextualizedArgs<CONTEXT, ARGS, true>).for = (
          method: (...args: any[]) => any
        ) => {
          return Object.assign(resp, { log: resp.log.for(method) });
        };
      } else {
        resp.log = resp.log.for(op);
      }
      return resp as METHOD extends string
        ? ContextualizedArgs<CONTEXT, ARGS, true>
        : ContextualizedArgs<CONTEXT, ARGS>;
    };

    let ctx: any = args.pop();
    const hasContext = ctx instanceof Context;
    if (ctx && !hasContext) {
      args.push(ctx);
      ctx = undefined;
    }
    if (!allowCreate && !hasContext)
      throw new InternalError("No context provided");
    if (hasContext && !allowCreate) {
      return response(
        this,
        {
          log: ctx.logger,
          ctx: ctx,
          ctxArgs: [...args, ctx],
        } as ContextualizedArgs<CONTEXT, ARGS>,
        operation
      ) as any;
    }
    return bootCtx
      .call(this, ...[...args, ctx].filter(Boolean))
      .then((resp) => {
        return response(
          this,
          {
            log: resp.logger,
            ctx: resp,
            ctxArgs: [...args, resp],
          } as ContextualizedArgs<CONTEXT, ARGS>,
          operation
        );
      }) as CREATE extends true
      ? Promise<
          ContextualizedArgs<
            CONTEXT,
            ARGS,
            METHOD extends string ? true : false
          >
        >
      : ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
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
