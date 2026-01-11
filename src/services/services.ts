import { AdapterFlags, FlagsOf } from "../persistence/types";
import { Context } from "../persistence/Context";
import { Logging, Logger, final } from "@decaf-ts/logging";
import {
  ContextualArgs,
  ContextualizedArgs,
  ContextualLoggedClass,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { DefaultAdapterFlags, PersistenceKeys } from "../persistence/constants";
import { injectableServiceKey } from "../utils/utils";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { UUID } from "../persistence/generators";

export abstract class Service<
  C extends Context<AdapterFlags> = Context<AdapterFlags>,
> extends ContextualLoggedClass<C> {
  protected constructor(readonly name?: string) {
    super();
  }

  /**
   * @description Creates repository flags for an operation
   * @summary Generates a set of flags that describe a database operation, combining default flags with overrides
   * @template F - The Repository Flags type
   * @template M - The model type
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Partial<F>} flags - Custom flag overrides
   * @param {...any[]} args - Additional arguments
   * @return {Promise<F>} The complete set of flags
   */
  protected async flags(
    operation: string,
    flags: Partial<FlagsOf<C>>,
    ...args: any[]
  ): Promise<FlagsOf<C>> {
    flags.correlationId =
      flags.correlationId || `${operation}-${UUID.instance.generate()}`;
    const log = (flags.logger || Logging.for(this as any)) as Logger;
    log.setConfig({ correlationId: flags.correlationId });
    return Object.assign({}, DefaultAdapterFlags, flags, {
      args: args,
      timestamp: new Date(),
      operation: operation,
      logger: log,
    }) as unknown as FlagsOf<C>;
  }

  /**
   * @description The context constructor for this adapter
   * @summary Reference to the context class constructor used by this adapter
   */
  protected readonly Context: Constructor<C> = Context<
    FlagsOf<C>
  > as unknown as Constructor<C>;

  async context(
    operation: ((...args: any[]) => any) | string,
    overrides: Partial<FlagsOf<C>>,
    ...args: MaybeContextualArg<Context<any>>
  ): Promise<C> {
    const log = this.log.for(this.context);
    log.silly(
      `creating new context for ${operation} operation with flag overrides: ${JSON.stringify(overrides)}`
    );
    let ctx = args.pop();
    if (typeof ctx !== "undefined" && !(ctx instanceof Context)) {
      args.push(ctx);
      ctx = undefined;
    }

    const flags = await this.flags(
      typeof operation === "string" ? operation : operation.name,
      overrides as Partial<FlagsOf<C>>,
      ...args
    );
    if (ctx) {
      return new this.Context(ctx).accumulate({
        ...flags,
        parentContext: ctx,
      }) as any;
    }
    return new this.Context().accumulate(flags) as any;
  }

  protected override logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    CONTEXT extends Context<any> = C,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
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
  protected override logCtx<
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

  /**
   * @description Retrieves a Service instance by name/class
   * @summary Looks up and returns a cached API instance by its name or constructor
   * @template A Type extending Api
   * @param {string | Constructor<A>} name - Name of the API or its constructor
   * @return {A} The requested API instance
   */
  static get<A extends Service>(name: string | symbol | Constructor<A>): A {
    if (!name) throw new InternalError(`No name provided`);
    const key = injectableServiceKey(name);
    const injectable = Injectables.get(key);
    if (injectable) return injectable as A;

    throw new InternalError(
      `No Service found for ${typeof name === "string" ? name : typeof name === "symbol" ? name.toString() : name.name}`
    );
  }

  static async boot<C extends Context<any> = any>(
    ...args: MaybeContextualArg<C>
  ): Promise<void> {
    let ctx = args.pop();
    if (typeof ctx !== "undefined" && !(ctx instanceof Context)) {
      args.push(ctx);
      ctx = undefined;
    }

    const flags = await Service.prototype.flags(
      PersistenceKeys.INITIALIZATION,
      {},
      ...args
    );
    ctx = ctx
      ? (new Service.prototype.Context(ctx).accumulate({
          ...flags,
          parentContext: ctx,
        }) as any)
      : (new Service.prototype.Context().accumulate(flags) as any);

    args = [...args, ctx];

    const { log, ctxArgs } = Service.prototype.logCtx(args, this.boot);
    const services = Injectables.services();
    for (const [key, service] of Object.entries(services)) {
      try {
        log.verbose(`Booting ${service.name} service...`);
        const s = Injectables.get<Service>(service as Constructor<Service>);
        if (!s)
          throw new InternalError(`Failed to resolve injectable for ${key}`);
        if (s instanceof ClientBasedService) {
          log.verbose(`Initializing ${service.name} service...`);
          await s.boot(...ctxArgs);
        }
      } catch (e: unknown) {
        throw new InternalError(`Failed to boot ${key} service:${e}`);
      }
    }
  }
}

export abstract class ClientBasedService<
  CLIENT,
  CONF,
  C extends Context<any> = any,
> extends Service {
  protected _client?: CLIENT;

  protected _config?: CONF;

  protected constructor() {
    super();
  }

  @final()
  async boot(...args: MaybeContextualArg<C>) {
    const { log, ctxArgs } = await this.logCtx(args, this.boot, true);
    log.verbose(`Initializing ${this.toString()}...`);
    const { config, client } = await this.initialize(...ctxArgs);
    this._config = config;
    this._client = client;
  }

  abstract initialize(...args: ContextualArgs<C>): Promise<{
    config: CONF;
    client: CLIENT;
  }>;

  @final()
  protected get config(): CONF {
    if (!this._config) throw new InternalError(`Config not initialized`);
    return this._config;
  }

  @final()
  get client(): CLIENT {
    if (!this._client) throw new InternalError(`Client not initialized`);
    return this._client;
  }

  async shutdown(...args: MaybeContextualArg<C>): Promise<void> {
    const { log } = await this.logCtx(args, this.shutdown, true);
    log.info(`Shutting down ${this.name} service...`);
  }
}
