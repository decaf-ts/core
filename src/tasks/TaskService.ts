import {
  type ContextualArgs,
  type ContextualizedArgs,
  type MaybeContextualArg,
  type MethodOrOperation,
} from "../utils/ContextualLoggedClass";
import { ClientBasedService } from "../services/services";
import { TaskEngine } from "./TaskEngine";
import { Context } from "../persistence/Context";
import { Adapter } from "../persistence/Adapter";
import {
  type AllOperationKeys,
  type ContextOf,
  type EventIds,
  type ObserverFilter,
} from "../persistence/types";
import { PersistenceKeys } from "../persistence/constants";
import { UnsupportedError } from "../persistence/errors";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
  type PrimaryKeyType,
} from "@decaf-ts/db-decorators";
import { OrderDirection } from "../repository/constants";
import { type Repo } from "../repository/Repository";
import { repository } from "../repository/decorators";
import { TaskModel } from "./models/TaskModel";
import { create, del, read, update } from "../utils/decorators";
import { PreparedStatementKeys } from "../query/constants";
import { type DirectionLimitOffset } from "../query/types";
import type { Constructor } from "@decaf-ts/decoration";
import type { Observer } from "../interfaces/Observer";
import type { ArrayMode } from "../services/ModelService";
import { TaskEngineConfig } from "./types";
import { TaskTracker } from "./TaskTracker";

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

  async push<I, O>(
    task: TaskModel<I, O>,
    ...args: MaybeContextualArg<any>
  ): Promise<TaskModel<I, O>>;
  async push<I, O>(
    task: TaskModel<I, O>,
    track: false,
    ...args: MaybeContextualArg<any>
  ): Promise<TaskModel<I, O>>;
  async push<I, O>(
    task: TaskModel<I, O>,
    track: true,
    ...args: MaybeContextualArg<any>
  ): Promise<{
    task: TaskModel<I, O>;
    tracker: TaskTracker<O>;
  }>;
  async push<I, O, TRACK extends boolean>(
    task: TaskModel<I, O>,
    track: TRACK = false as TRACK,
    ...args: MaybeContextualArg<any>
  ): Promise<
    TRACK extends true
      ? { task: TaskModel<I, O>; tracker: TaskTracker<O> }
      : TaskModel
  > {
    const { ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.push);

    const created = (await this.client.push(task, track, ...ctxArgs)) as any;
    if (!(await this.client.isRunning())) {
      void this.client.start();
    }
    return created;
  }

  async track(
    id: string,
    ...args: MaybeContextualArg<any>
  ): Promise<{ task: TaskModel; tracker: TaskTracker<any> }> {
    const { ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.push);
    return this.client.track(id, ...ctxArgs);
  }

  @create()
  async create(
    model: TaskModel,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel> {
    const { ctxArgs } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.create);
    const created = await this.repo.create(model, ...ctxArgs);
    if (!(await this.client.isRunning())) {
      void this.client.start();
    }
    return created;
  }

  @create()
  async createAll(
    models: TaskModel[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<TaskModel[]> {
    const { ctxArgs } = (
      await this.logCtx(args, BulkCrudOperationKeys.CREATE_ALL, true)
    ).for(this.createAll);
    const created = await this.repo.createAll(models, ...ctxArgs);
    if (!(await this.client.isRunning())) void this.client.start();
    return created;
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
    const { ctxArgs, ctx } = (
      await this.logCtx(args, PersistenceKeys.SHUTDOWN, true)
    ).for(this.shutdown);
    await super.shutdown(...ctxArgs);
    await this.client.stop(ctx);
  }
}
