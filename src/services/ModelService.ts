import { type Constructor } from "@decaf-ts/decoration";
import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";
import { type Repo, Repository } from "../repository/Repository";
import { Service } from "./services";
import type { ContextOf } from "../persistence/types";
import {
  InternalError,
  type IRepository,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import type {
  ContextualizedArgs,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { create, del, service, read, update } from "../utils/decorators";
import { OrderDirection } from "../repository/constants";
import { type DirectionLimitOffset } from "../query/types";

export type ArrayMode = "one" | "many";

const resolveAlias = (
  alias: string | symbol | Constructor<Model<any>>
): string => {
  if (typeof alias === "string")
    return alias.endsWith("Service") ? alias : `${alias}Service`;
  if (typeof alias === "symbol") return alias.toString();
  return `${alias.name}Service`;
};

export class ModelService<M extends Model<boolean>, R extends Repo<M> = Repo<M>>
  extends Service
  implements IRepository<M, ContextOf<R>>
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
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.create, true);
    return this.repo.create(model, ...ctxArgs);
  }

  @create()
  async createAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.createAll, true);
    return this.repo.createAll(models, ...ctxArgs);
  }

  @del()
  async delete(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.delete, true);
    return this.repo.delete(key, ...ctxArgs);
  }

  @del()
  async deleteAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M[]> {
    const { ctxArgs } = await this.logCtx(args, this.deleteAll, true);
    return this.repo.deleteAll(keys, ...ctxArgs);
  }

  @read()
  async read(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { ctxArgs } = await this.logCtx(args, this.read, true);
    return this.repo.read(key, ...ctxArgs);
  }

  @read()
  async readAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<R>>
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
    ...args: MaybeContextualArg<ContextOf<R>>
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
  //   ...args: MaybeContextualArg<ContextOf<R>>
  // ): Promise<M[]> {
  //   const { ctxArgs } = await this.logCtx(args, this.query, true);
  //   return this.repo.query(condition, orderBy, order, limit, skip, ...ctxArgs);
  // }

  async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.listBy, true);
    return this.repo.listBy(key, order, ...ctxArgs);
  }

  async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction">,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.paginateBy, true);
    return this.repo.paginateBy(key, order, ref, ...ctxArgs);
  }

  async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.findOneBy, true);
    return this.repo.findOneBy(key, value, ...ctxArgs);
  }

  async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { ctxArgs } = await this.logCtx(args, this.findBy, true);
    return this.repo.findBy(key, value, ...ctxArgs);
  }

  async statement(name: string, ...args: MaybeContextualArg<ContextOf<R>>) {
    const { ctxArgs } = await this.logCtx(args, this.statement, true);
    return this.repo.statement(name, ...ctxArgs);
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

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["repo"]>, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<this["repo"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["repo"]>, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<this["repo"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["repo"]>, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<
      ContextOf<this["repo"]>,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["repo"]>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<this["repo"]>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<this["repo"]>,
        ARGS,
        METHOD extends string ? true : false
      > {
    const ctx = this.repo["adapter"]["logCtx"](
      [this.repo.class as any, ...args] as any,
      operation,
      allowCreate as any,
      this.repo["_overrides"] || {}
    );
    function squashArgs(ctx: ContextualizedArgs<ContextOf<any>>) {
      ctx.ctxArgs.shift(); // removes added model to args
      return ctx.ctxArgs as any;
    }

    if (!(ctx instanceof Promise)) return squashArgs(ctx);
    return ctx.then(squashArgs);
  }
}
