import { type Constructor } from "@decaf-ts/decoration";
import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";
import { type Repo, Repository } from "../repository/Repository";
import { Service } from "./services";
import type {
  AllOperationKeys,
  ContextOf,
  EventIds,
  ObserverFilter,
  PersistenceObservable,
  PersistenceObserver,
} from "../persistence/types";
import {
  BulkCrudOperationKeys,
  InternalError,
  type IRepository,
  OperationKeys,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import type {
  ContextualArgs,
  ContextualizedArgs,
  MaybeContextualArg,
  MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { create, del, read, service, update } from "../utils/decorators";
import { OrderDirection } from "../repository/constants";
import { type DirectionLimitOffset } from "../query/types";
import { type Observer } from "../interfaces";
import { PersistenceKeys } from "../persistence/constants";
import { PreparedStatementKeys } from "../query/constants";
import { SelectSelector, WhereOption } from "../query/index";
import { Context } from "../persistence/index";

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
  extends Service<ContextOf<R>>
  implements
    IRepository<M, ContextOf<R>>,
    PersistenceObservable<ContextOf<R>>,
    PersistenceObserver<ContextOf<R>>
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

  constructor(private readonly clazz: Constructor<M>) {
    super();
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

  @create()
  async create(
    model: M,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.create);
    const created = await this.repo.create(model, ...ctxArgs);
    log.action(OperationKeys.CREATE, {
      model: this.class.name,
      operation: OperationKeys.CREATE,
    });
    return created;
  }

  @create()
  async createAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.CREATE_ALL, true)
    ).for(this.createAll);
    const created = await this.repo.createAll(models, ...ctxArgs);
    log.action(BulkCrudOperationKeys.CREATE_ALL, {
      model: this.class.name,
      operation: BulkCrudOperationKeys.CREATE_ALL,
      count: created.length,
    });
    return created;
  }

  @del()
  async delete(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, OperationKeys.DELETE, true)
    ).for(this.delete);
    const deleted = await this.repo.delete(key, ...ctxArgs);
    log.action(OperationKeys.DELETE, {
      model: this.class.name,
      operation: OperationKeys.DELETE,
      id: String(key),
    });
    return deleted;
  }

  @del()
  async deleteAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.DELETE_ALL, true)
    ).for(this.deleteAll);
    const deleted = await this.repo.deleteAll(keys, ...ctxArgs);
    log.action(BulkCrudOperationKeys.DELETE_ALL, {
      model: this.class.name,
      operation: BulkCrudOperationKeys.DELETE_ALL,
      count: deleted.length,
      ids: keys.map(String),
    });
    return deleted;
  }

  @read()
  async read(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, OperationKeys.READ, true)
    ).for(this.read);
    const result = await this.repo.read(key, ...ctxArgs);
    log.action(OperationKeys.READ, {
      model: this.class.name,
      operation: OperationKeys.READ,
      id: String(key),
    });
    return result;
  }

  @read()
  async readAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.READ_ALL, true)
    ).for(this.readAll);
    const result = await this.repo.readAll(keys, ...ctxArgs);
    log.action(BulkCrudOperationKeys.READ_ALL, {
      model: this.class.name,
      operation: BulkCrudOperationKeys.READ_ALL,
      count: result.length,
      ids: keys.map(String),
    });
    return result;
  }

  @read()
  async query<M, R extends ArrayMode = "one">(
    methodName: string,
    ...args: unknown[]
  ): Promise<R extends "one" ? M : M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.QUERY, true)
    ).for(this.query);
    const method = (this.repo as any)?.[methodName];
    if (typeof method !== "function")
      throw new InternalError(`Method "${methodName}" is not implemented`);

    const result = await method.apply(this.repo, ctxArgs);
    log.action(PersistenceKeys.PREPARED_STATEMENT, {
      model: this.class.name,
      operation: PersistenceKeys.QUERY,
      method: methodName,
    });
    return result;
  }

  @update()
  async update(
    model: M,
    ...args: MaybeContextualArg<ContextOf<R>>
  ): Promise<M> {
    const { log, ctxArgs } = (
      await this.logCtx(args, OperationKeys.UPDATE, true)
    ).for(this.update);
    const updated = await this.repo.update(model, ...ctxArgs);
    log.action(OperationKeys.UPDATE, {
      model: this.class.name,
      operation: OperationKeys.UPDATE,
    });
    return updated;
  }

  @update()
  async updateAll(models: M[], ...args: any[]): Promise<M[]> {
    const { log, ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.UPDATE_ALL, true)
    ).for(this.updateAll);
    const updated = await this.repo.updateAll(models, ...ctxArgs);
    log.action(BulkCrudOperationKeys.UPDATE_ALL, {
      model: this.class.name,
      operation: BulkCrudOperationKeys.UPDATE_ALL,
      count: updated.length,
    });
    return updated;
  }

  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<M>[],
  >(): WhereOption<M, M[]>;
  select<S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): WhereOption<M, Pick<M, S[number]>[]>;
  select<S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): WhereOption<M, M[]> | WhereOption<M, Pick<M, S[number]>[]> {
    return this.repo.select(selector as readonly [...S]);
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
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    const result = await this.repo.listBy(key, order, ...ctxArgs);
    log.action(PersistenceKeys.QUERY, {
      model: this.class.name,
      operation: PreparedStatementKeys.LIST_BY,
      field: String(key),
      order,
    });
    return result;
  }

  async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction">,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    const result = await this.repo.paginateBy(key, order, ref, ...ctxArgs);
    log.action(PersistenceKeys.QUERY, {
      model: this.class.name,
      operation: PreparedStatementKeys.PAGE_BY,
      field: String(key),
      order,
    });
    return result;
  }

  async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_ONE_BY, true)
    ).for(this.findOneBy);
    const result = await this.repo.findOneBy(key, value, ...ctxArgs);
    log.action(PersistenceKeys.TABLE_SCAN, {
      model: this.class.name,
      operation: PreparedStatementKeys.FIND_ONE_BY,
      field: String(key),
    });
    return result;
  }

  async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_BY, true)
    ).for(this.findBy);
    const result = await this.repo.findBy(key, value, ...ctxArgs);
    log.action(PersistenceKeys.TABLE_SCAN, {
      model: this.class.name,
      operation: PreparedStatementKeys.FIND_BY,
      field: String(key),
    });
    return result;
  }

  async findByPaginate(
    key: keyof M,
    value: any,
    ref: DirectionLimitOffset,
    ...args: MaybeContextualArg<ContextOf<R>>
  ) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_BY_PAGINATE, true)
    ).for(this.findByPaginate);
    const result = await this.repo.findByPaginate(key, value, ref, ...ctxArgs);
    log.action(PersistenceKeys.TABLE_SCAN, {
      model: this.class.name,
      operation: PreparedStatementKeys.FIND_BY_PAGINATE,
      field: String(key),
    });
    return result;
  }

  async statement(name: string, ...args: MaybeContextualArg<ContextOf<R>>) {
    const { log, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    const result = await this.repo.statement(name, ...ctxArgs);
    log.action(PersistenceKeys.PREPARED_STATEMENT, {
      model: this.class.name,
      operation: PersistenceKeys.STATEMENT,
      statement: name,
    });
    return result;
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

  override refresh(
    table: Constructor<M>,
    event: AllOperationKeys,
    id: EventIds,
    ...args: ContextualArgs<ContextOf<R>>
  ): Promise<void> {
    return this.repo.refresh(table, event, id, ...args);
  }
  override observe(observer: Observer, filter?: ObserverFilter): () => void {
    return this.repo.observe(observer, filter);
  }

  override unObserve(observer: Observer): void {
    return this.repo.unObserve(observer);
  }

  override updateObservers(
    model: Constructor,
    operation: AllOperationKeys,
    ids: EventIds,
    ...args: ContextualArgs<ContextOf<R>>
  ) {
    return this.repo.updateObservers(model, operation, ids, ...args);
  }

  protected override logCtx<
    CONTEXT extends Context<any> = Context<any>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<this["repo"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    CONTEXT extends Context<any> = Context<any>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<this["repo"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    CONTEXT extends Context<any> = Context<any>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
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
    CONTEXT extends Context<any> = Context<any>,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
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
    const ctx = this.repo["_adapter"]["logCtx"](
      [this.repo.class as any, ...args] as any,
      operation,
      allowCreate as any,
      this.repo["_overrides"] || {}
    );
    function squashArgs(ctx: ContextualizedArgs<ContextOf<any>>) {
      ctx.ctxArgs.shift(); // removes added model to args
      return ctx as any;
    }

    if (!(ctx instanceof Promise)) return squashArgs(ctx);
    return ctx.then(squashArgs);
  }
}
