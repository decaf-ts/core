import {
  Context,
  Contextual,
  DefaultRepositoryFlags,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { final, Logging, Logger } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
import { Injectables } from "@decaf-ts/injectable-decorators";
import {
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
} from "./ContextualLoggedClass";
import { FlagsOf, LoggerOf } from "../persistence/index";

export abstract class Service<C extends Context<any> = any>
  implements Contextual<C>
{
  protected constructor(readonly name?: string) {}

  /**
   * @description Creates repository flags for an operation
   * @summary Generates a set of flags that describe a database operation, combining default flags with overrides
   * @template F - The Repository Flags type
   * @template M - The model type
   * @param {OperationKeys} operation - The type of operation being performed
   * @param {Constructor<M>} model - The model constructor
   * @param {Partial<F>} flags - Custom flag overrides
   * @param {...any[]} args - Additional arguments
   * @return {Promise<F>} The complete set of flags
   */
  protected async flags(
    operation: OperationKeys | string,
    flags: Partial<FlagsOf<C>>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<FlagsOf<C>> {
    let log = (flags.logger || Logging.for(this.toString())) as Logger;
    if (flags.correlationId)
      log = log.for({ correlationId: flags.correlationId });
    return Object.assign({}, DefaultRepositoryFlags, flags, {
      timestamp: new Date(),
      operation: operation,
      logger: log,
    }) as FlagsOf<C>;
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
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FlagsOf<C>>,
    ...args: any[]
  ): Promise<C> {
    const flags = await this.flags(operation, overrides, ...args);
    return new this.Context().accumulate(flags) as unknown as C;
  }

  protected async logCtx<ARGS extends any[]>(
    args: ARGS,
    method: ((...args: any[]) => any) | string,
    allowCreate = false
  ): Promise<ContextualizedArgs<any, ARGS>> {
    return (await Service.logCtx.bind(this)(
      args,
      method as any,
      allowCreate
    )) as ContextualizedArgs<C, ARGS>;
  }

  protected static async logCtx<
    CONTEXT extends Context<any>,
    ARGS extends any[],
  >(
    this: Contextual,
    args: ARGS,
    operation: ((...args: any[]) => any) | string,
    allowCreate: boolean = false
  ): Promise<ContextualizedArgs<CONTEXT, ARGS>> {
    const bootCtx = async function bootCtx(this: Contextual) {
      if (!allowCreate) throw new InternalError("No context provided");
      return this.context(
        typeof operation === "string" ? operation : operation.name,
        {}
      );
    }.bind(this);

    if (args.length < 1) {
      args = [await bootCtx()] as ARGS;
    }
    const ctx = args.pop() as CONTEXT;
    if (!(ctx instanceof Context)) args = [...args, await bootCtx()] as ARGS;
    const log = (
      this
        ? ctx.logger.for(this).for(operation)
        : ctx.logger.clear().for(this).for(operation)
    ) as LoggerOf<CONTEXT>;
    return {
      ctx: ctx,
      log: operation ? (log.for(operation) as LoggerOf<CONTEXT>) : log,
      ctxArgs: [...args, ctx],
    };
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

    const injectable = Injectables.get(name);
    if (injectable) return injectable as A;

    throw new InternalError(
      `No Service found for ${typeof name === "string" ? name : typeof name === "symbol" ? name.toString() : name.name}`
    );
  }

  static async boot<C extends Context<any> = any>(
    ...args: MaybeContextualArg<C>
  ): Promise<void> {
    const factory: Contextual = {
      async context(
        operation:
          | OperationKeys.CREATE
          | OperationKeys.READ
          | OperationKeys.UPDATE
          | OperationKeys.DELETE
          | string,
        overrides: Partial<FlagsOf<Context<any>>>,
        ...args
      ): Promise<Context<any>> {
        return new Context().accumulate(
          Object.assign({}, DefaultRepositoryFlags, {
            timestamp: new Date(),
            operation: operation,
            logger: Logging.get(),
          })
        ) as FlagsOf<C>;
      },
    };

    const { log, ctxArgs } = await this.logCtx.bind(factory)(
      args,
      this.boot,
      true
    );
    const services = Injectables.services();
    for (const [key, service] of Object.entries(services)) {
      try {
        const s = new service();
        if (s instanceof ClientBasedService) await s.boot(...ctxArgs);
      } catch (e: unknown) {
        log.error(`Failed to boot ${key} service`, e as Error);
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
    const { log, ctxArgs } = await this.logCtx(args, this.boot);
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
