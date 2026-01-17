import {
  type ContextualArgs,
  type ContextualizedArgs,
  type MaybeContextualArg,
  type MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { ClientBasedService } from "../services/services";
import { TaskEngine, type TaskEngineConfig } from "./TaskEngine";
import {
  Adapter,
  type AllOperationKeys,
  Context,
  type ContextOf,
  type EventIds,
  type ObserverFilter,
  PersistenceKeys,
  UnsupportedError,
} from "../persistence/index";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { OrderDirection, type Repo, repository } from "../repository/index";
import { TaskModel } from "./models/TaskModel";
import { create, del, read, update } from "../utils/index";
import {
  type DirectionLimitOffset,
  PreparedStatementKeys,
} from "../query/index";
import type { Constructor } from "@decaf-ts/decoration";
import type { Observer } from "../interfaces/index";
import { ArrayMode } from "../services/index";

export class TaskService<
  A extends Adapter<any, any, any, any>,
> extends ClientBasedService<TaskEngine<A>, TaskEngineConfig<A>> {
  @repository(TaskModel)
  protected repo!: Repo<TaskModel>;

  constructor() {
    super();
  }

  override async initialize(
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<{ config: TaskEngineConfig<A>; client: TaskEngine<A> }> {
    const cfg = args.shift() as TaskEngineConfig<A> | any;
    if (!cfg || cfg instanceof Context)
      throw new InternalError(`No/invalid config provided`);
    const { log } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    if (!cfg.adapter) throw new InternalError(`No adapter provided`);
    log.info(`Initializing Task Engine...`);
    const client: TaskEngine<A> = new TaskEngine(cfg);
    log.verbose(`${client} initialized`);
    return {
      client: client,
      config: cfg,
    };
  }

  @create()
  async create(
    model: TaskModel,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel> {
    const { ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.create);
    return this.repo.create(model, ...ctxArgs);
    if (!this.client.isRunning()) this.client.start();
  }

  @create()
  async createAll(
    models: TaskModel[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel[]> {
    const { ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.CREATE_ALL, true)
    ).for(this.createAll);
    return this.repo.createAll(models, ...ctxArgs);
    if (!this.client.isRunning()) this.client.start();
  }

  @del()
  async delete(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel> {
    const { ctxArgs } = (
      await this.logCtx(args, OperationKeys.DELETE, true)
    ).for(this.delete);
    return this.repo.delete(key, ...ctxArgs);
  }

  @del()
  async deleteAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel[]> {
    const { ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.DELETE_ALL, true)
    ).for(this.deleteAll);
    return this.repo.deleteAll(keys, ...ctxArgs);
  }

  @read()
  async read(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel> {
    const { ctxArgs } = (await this.logCtx(args, OperationKeys.READ, true)).for(
      this.read
    );
    return this.repo.read(key, ...ctxArgs);
  }

  @read()
  async readAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel[]> {
    const { ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.READ_ALL, true)
    ).for(this.readAll);
    return this.repo.readAll(keys, ...ctxArgs);
  }

  @read()
  async query<M, R extends ArrayMode = "one">(
    methodName: string,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<R extends "one" ? M : M[]> {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.QUERY, true)
    ).for(this.query);
    const method = (this.repo as any)?.[methodName];
    if (typeof method !== "function")
      throw new InternalError(`Method "${methodName}" is not implemented`);

    return method.apply(this.repo, ctxArgs);
  }

  @update()
  async update(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    model: TaskModel,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel> {
    throw new UnsupportedError("Updates to tasks are not available");
  }

  @update()
  async updateAll(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    models: TaskModel[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel[]> {
    throw new UnsupportedError("Updates to tasks are not available");
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
    key: keyof TaskModel,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.LIST_BY, true)
    ).for(this.listBy);
    return this.repo.listBy(key, order, ...ctxArgs);
  }

  async paginateBy(
    key: keyof TaskModel,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction">,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.PAGE_BY, true)
    ).for(this.paginateBy);
    return this.repo.paginateBy(key, order, ref, ...ctxArgs);
  }

  async findOneBy(
    key: keyof TaskModel,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_ONE_BY, true)
    ).for(this.findOneBy);
    return this.repo.findOneBy(key, value, ...ctxArgs);
  }

  async findBy(
    key: keyof TaskModel,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { ctxArgs } = (
      await this.logCtx(args, PreparedStatementKeys.FIND_BY, true)
    ).for(this.findBy);
    return this.repo.findBy(key, value, ...ctxArgs);
  }

  async statement(name: string, ...args: MaybeContextualArg<ContextOf<A>>) {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.STATEMENT, true)
    ).for(this.statement);
    return this.repo.statement(name, ...ctxArgs);
  }

  override refresh(
    table: Constructor<any>,
    event: AllOperationKeys,
    id: EventIds,
    ...args: ContextualArgs<ContextOf<A>>
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
    ...args: ContextualArgs<ContextOf<A>>
  ) {
    return this.repo.updateObservers(model, operation, ids, ...args);
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<A>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<ContextOf<A>, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<A>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<A>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<A>,
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
      return ctx as any;
    }

    if (!(ctx instanceof Promise)) return squashArgs(ctx);
    return ctx.then(squashArgs);
  }

  override async shutdown(...args: MaybeContextualArg<any>): Promise<void> {
    const { ctxArgs } = await this.logCtx(args, "shutdown", true);
    await super.shutdown(...ctxArgs);
    this.client.stop();
  }
}
