import type {
  ContextOfRepository,
  Contextual,
  FlagsOf as ContextualFlagsOf,
} from "@decaf-ts/db-decorators";
import {
  InternalError,
  IRepository,
  OperationKeys,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { final, Logger, Logging } from "@decaf-ts/logging";
import type { Constructor } from "@decaf-ts/decoration";
import { Injectables } from "@decaf-ts/injectable-decorators";
import type {
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
} from "./ContextualLoggedClass";
import {
  type AdapterFlags,
  type FlagsOf,
  type LoggerOf,
} from "../persistence/types";
import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository/Repository";
import { create, del, read, service, update } from "./decorators";
import { Context } from "../persistence/Context";
import { DefaultAdapterFlags } from "../persistence/constants";
import { OrderDirection } from "../repository/constants";

export abstract class Service<
  C extends Context<AdapterFlags> = Context<AdapterFlags>,
> {
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
    return Object.assign({}, DefaultAdapterFlags, flags, {
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
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<ContextualFlagsOf<C>>,
    ...args: any[]
  ): Promise<C> {
    const normalizedOverrides = overrides as Partial<FlagsOf<C>>;
    const flags = await this.flags(operation, normalizedOverrides, ...args);
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
    allowCreate: boolean = false,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...argz: any[]
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
          | string
      ): Promise<Context<any>> {
        return new Context().accumulate(
          Object.assign({}, DefaultAdapterFlags, {
            timestamp: new Date(),
            operation: operation,
            logger: Logging.get(),
          })
        );
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

export type ArrayMode = "one" | "many";

const resolveAlias = (
  alias: string | symbol | Constructor<Model<any>>
): string => {
  if (typeof alias === "string")
    return alias.endsWith("Service") ? alias : `${alias}Service`;
  if (typeof alias === "symbol") return alias.toString();
  return `${alias.name}Service`;
};

export class ModelService<
    M extends Model<boolean>,
    R extends Repository<M, any> = Repository<M, any>,
  >
  extends Service
  implements IRepository<M, ContextOfRepository<R>>
{
  protected _repository!: R;

  get class() {
    if (!this.clazz) throw new InternalError(`Class not initialized`);
    return this.clazz;
  }

  get repo() {
    if (!this._repository) this._repository = Repository.forModel(this.clazz);
    return this._repository;
  }

  constructor(
    private readonly clazz: Constructor<M>,
    name?: string
  ) {
    super(name ?? `${clazz.name}Service`);
  }

  static getService<M extends Model<boolean>, S extends ModelService<M>>(
    name: string | symbol | Constructor<M>
  ): S {
    if (!name) throw new InternalError(`No name provided`);

    const alias = resolveAlias(name);
    try {
      const injectable = Service.get(alias);
      if (injectable) return injectable as S;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      // ignore
    }

    throw new InternalError(`No ModelService found for alias ${alias}`);
  }

  for(conf: any, ...args: any[]): this {
    const target = this as any;
    return new Proxy(target, {
      get(original, prop, receiver) {
        if (prop === "repo") {
          return (original.repo as any).for(conf, ...args);
        }
        return Reflect.get(original, prop, receiver);
      },
    }) as this;
  }

  @create()
  async create(
    model: M,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.create, true);
    return this.repo.create(model, ...ctxArgs);
  }

  @create()
  async createAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.createAll, true);
    return this.repo.createAll(models, ...ctxArgs);
  }

  @del()
  async delete(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.delete, true);
    return this.repo.delete(key, ...ctxArgs);
  }

  @del()
  async deleteAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.deleteAll, true);
    return this.repo.deleteAll(keys, ...ctxArgs);
  }

  @read()
  async read(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.read, true);
    return this.repo.read(key, ...ctxArgs);
  }

  @read()
  async readAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.readAll, true);
    return this.repo.readAll(keys, ...ctxArgs);
  }

  @read()
  async query<M, R extends ArrayMode = "one">(
    methodName: string,
    ...args: unknown[]
  ): Promise<R extends "one" ? M : M[]> {
    const method = (this.repo as any)?.[methodName];
    if (typeof method !== "function")
      throw new Error(`Method "${methodName}" is not implemented`);

    return method.apply(this.repo, args);
  }

  @update()
  async update(
    model: M,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.update, true);
    return this.repo.update(model, ...ctxArgs);
  }

  @update()
  async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.updateAll, true);
    return this.repo.updateAll(models, ...ctxArgs);
  }
  //
  // async query(
  //   condition: Condition<M>,
  //   orderBy: keyof M,
  //   order: OrderDirection = OrderDirection.ASC,
  //   limit?: number,
  //   skip?: number,
  //   ...args: MaybeContextualArg<ContextOfRepository<R>>
  // ): Promise<M[]> {
  //   const { ctxArgs } = await this.logCtx(args, this.query, true);
  //   return this.repo.query(condition, orderBy, order, limit, skip, ...ctxArgs);
  // }

  async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.listBy, true);
    return this.repo.listBy(key, order, ...ctxArgs);
  }

  async paginateBy(
    key: keyof M,
    order: OrderDirection,
    size: number,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.paginateBy, true);
    return this.repo.paginateBy(key, order, size, ...ctxArgs);
  }

  async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.findOneBy, true);
    return this.repo.findOneBy(key, value, ...ctxArgs);
  }

  async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.findBy, true);
    return this.repo.findBy(key, value, ...ctxArgs);
  }

  async statement(
    name: string,
    ...args: MaybeContextualArg<ContextOfRepository<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.statement, true);
    return this.repo.statement(name, ...ctxArgs);
  }

  protected override async logCtx<ARGS extends any[]>(
    args: ARGS,
    method: ((...args: any[]) => any) | string,
    allowCreate = false
  ): Promise<ContextualizedArgs<any, ARGS>> {
    return (await ModelService.logCtx.bind(this.repo["adapter"])(
      args,
      method as any,
      allowCreate,
      {},
      this.class
    )) as ContextualizedArgs<ContextOfRepository<R>, ARGS>;
  }

  static forModel<M extends Model<boolean>, S extends ModelService<M>>(
    this: new (model: ModelConstructor<M>) => S,
    model: ModelConstructor<M>,
    alias?: string | symbol
  ): S {
    let instance: S | undefined;
    alias = resolveAlias(alias || model);

    try {
      instance = ModelService.get(alias) as S;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      instance = undefined;
    }

    if (instance instanceof ModelService) return instance as S;

    const Base = this as Constructor;
    @service(alias)
    class DecoratedService extends Base {
      constructor() {
        super(model);
      }
    }
    return new DecoratedService() as S;
  }

  protected static override async logCtx<
    CONTEXT extends Context<any>,
    ARGS extends any[],
  >(
    this: Contextual,
    args: ARGS,
    operation: ((...args: any[]) => any) | string,
    allowCreate: boolean = false,
    overrides: Partial<FlagsOf<CONTEXT>> = {},
    constructor: ModelConstructor<any>
  ): Promise<ContextualizedArgs<CONTEXT, ARGS>> {
    const bootCtx = async function bootCtx(this: Contextual) {
      if (!allowCreate) throw new InternalError("No context provided");
      return this.context(
        typeof operation === "string" ? operation : operation.name,
        overrides,
        constructor
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
}
