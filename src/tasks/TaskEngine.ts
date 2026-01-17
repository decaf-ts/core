import { TaskModel } from "./models/TaskModel";
import { Repo, Repository } from "../repository/Repository";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventBus } from "./TaskEventBus";
import { Condition } from "../query/Condition";
import { TaskStepResultModel } from "./models/TaskStepResultModel";
import { TaskLogEntryModel } from "./models/TaskLogEntryModel";
import {
  DefaultTaskEngineConfig,
  TaskEventType,
  TaskStatus,
  TaskType,
} from "./constants";
import { Adapter } from "../persistence/Adapter";
import { Context } from "../persistence/Context";
import { ContextOf, FlagsOf } from "../persistence/types";
import { LogLevel } from "@decaf-ts/logging";
import {
  AbsContextual,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { computeBackoffMs, serializeError, sleep } from "./utils";
import { TaskContext } from "./TaskContext";
import { Constructor } from "@decaf-ts/decoration";
import { TaskLogger } from "./logging";
import { TaskEngineConfig, TaskProgressPayload } from "./types";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskTracker } from "./TaskTracker";

export class TaskEngine<
  A extends Adapter<any, any, any, any>,
> extends AbsContextual<ContextOf<A>> {
  private _tasks?: Repo<TaskModel>;
  private _events?: Repo<TaskEventModel>;

  protected override get Context(): Constructor<ContextOf<A>> {
    return TaskContext as unknown as Constructor<ContextOf<A>>;
  }

  protected get adapter() {
    return this.config.adapter;
  }

  protected get registry() {
    return this.config.registry;
  }

  protected get bus() {
    return this.config.bus;
  }

  protected get tasks(): Repo<TaskModel> {
    if (this._tasks) return this._tasks;
    this._tasks = Repository.forModel(TaskModel, this.adapter.alias);
    return this._tasks;
  }

  protected get events(): Repo<TaskEventModel> {
    if (this._events) return this._events;
    this._events = Repository.forModel(
      TaskEventModel,
      this.config.adapter.alias
    );
    return this._events;
  }

  protected running = false;

  constructor(private config: TaskEngineConfig<A>) {
    super();
    this.config = Object.assign({}, DefaultTaskEngineConfig, config, {
      bus: config.bus || new TaskEventBus(),
      registry: config.registry || new TaskHandlerRegistry(),
    });
  }

  isRunning(): boolean {
    return this.running;
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
    tracker: TaskTracker<(typeof task)["output"]>;
  }>;
  async push<I, O, TRACK extends boolean>(
    task: TaskModel<I, O>,
    track: TRACK = false as TRACK,
    ...args: MaybeContextualArg<any>
  ): Promise<
    TRACK extends true
      ? { task: TaskModel<I, O>; tracker: TaskTracker<(typeof task)["output"]> }
      : TaskModel
  > {
    const { ctx, log } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.push);
    log.verbose(`pushing task ${task.classification}`);
    const t = await this.tasks.create(task, ctx);
    log.info(`${task.classification} task registered under ${t.id}`);
    if (!track) return t as any;
    const tracker = new TaskTracker(this.bus, t);
    return { task, tracker } as any;
  }

  async cancel(
    id: string,
    ...args: MaybeContextualArg<any>
  ): Promise<TaskModel> {
    const { ctx } = (await this.logCtx(args, "cancel", true)).for(this.cancel);
    const t = await this.tasks.read(id, ctx);
    if (t.status === TaskStatus.SUCCEEDED || t.status === TaskStatus.FAILED)
      return t;
    t.status = TaskStatus.CANCELED;
    t.leaseOwner = undefined;
    t.leaseExpiry = undefined;
    const saved = await this.tasks.update(t, ctx);
    await this.emitStatus(ctx, saved, TaskStatus.CANCELED);
    return saved;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  stop(): void {
    this.running = false;
  }

  // -------------------------
  // Worker loop
  // -------------------------

  private async loop(): Promise<void> {
    while (this.running) {
      const { ctx } = await this.logCtx([], "loop", true);
      const claimed = await this.claimBatch(ctx);
      await Promise.allSettled(claimed.map((t) => this.executeClaimed(t, ctx)));
      await sleep(
        claimed.length ? this.config.pollMsBusy : this.config.pollMsIdle
      );
    }
  }

  private async claimBatch(ctx: Context<any>): Promise<TaskModel[]> {
    const log = ctx.logger.for(this.claimBatch);
    const now = ctx.timestamp;

    // Runnable:
    // - PENDING
    // - WAITING_RETRY with nextRunAt <= now
    // - RUNNING with expired lease (recovery)
    const condPending = Condition.attribute<TaskModel>("status").eq(
      TaskStatus.PENDING
    );
    const condRetry = Condition.attribute<TaskModel>("status")
      .eq(TaskStatus.WAITING_RETRY)
      .and(Condition.attribute<TaskModel>("nextRunAt").lte(now));

    const condLeaseExpired = Condition.attribute<TaskModel>("status")
      .eq(TaskStatus.RUNNING)
      .and(Condition.attribute<TaskModel>("leaseExpiry").lte(now));

    const runnable = condPending.or(condRetry).or(condLeaseExpired);

    // Fetch more than concurrency because some will fail to claim due to conflicts
    const candidates: TaskModel[] = await this.tasks
      .select()
      .where(runnable)
      .limit(Math.max(this.config.concurrency * 4, 20))
      .execute();

    log.verbose(`claimBatch candidates:${candidates.length}`);

    const out: TaskModel[] = [];
    for (const c of candidates) {
      const claimed = await this.tryClaim(c, ctx);
      if (claimed) out.push(claimed);
      if (out.length >= this.config.concurrency) break;
    }
    log.verbose(`claimBatch claimed:${out.length}`);
    return out;
  }

  private async tryClaim(
    task: TaskModel,
    ctx: Context
  ): Promise<TaskModel | null> {
    const log = ctx.logger.for(this.claimBatch);
    const now = new Date().getTime();

    const claimed = new TaskModel({
      ...task,
      status: TaskStatus.RUNNING,
      leaseOwner: this.config.workerId,
      leaseExpiry: new Date(now + this.config.leaseMs),
    });

    log.info(
      `running handler for ${task.id} (${task.classification}) atomicity ${task.atomicity}`
    );
    try {
      // optimistic update; conflict errors depend on adapter implementation
      return await this.tasks.update(claimed, ctx);
    } catch {
      return null;
    }
  }

  // -------------------------
  // Execution
  // -------------------------

  private async executeClaimed(
    task: TaskModel,
    context: Context<any>
  ): Promise<void> {
    const { ctx, log } = (
      await this.logCtx([context], task.classification, true)
    ).for(this.executeClaimed);
    const taskCtx: TaskContext = new TaskContext(ctx).accumulate({
      taskId: task.id,
      logger: new TaskLogger(
        log,
        this.config.streamBufferSize,
        this.config.maxLoggingBuffer
      ),
      attempt: task.attempt,
      resultCache: {},
      pipe: async (data: [LogLevel, string, any][]) => {
        const [, logs] = await this.appendLog(taskCtx, task, data);
        await this.emitLog(taskCtx, task.id, logs);
      },
      flush: async () => {
        return taskCtx.logger.flush(taskCtx.pipe);
      },
      progress: async (data: any) => {
        await this.emitProgress(taskCtx, task.id, data);
      },
      heartbeat: async () => {
        // extend lease
        if (task.leaseOwner !== this.config.workerId) return;
        task.leaseExpiry = new Date(Date.now() + this.config.leaseMs);
        try {
          task = await this.tasks.update(task);
        } catch {
          // if we lose the claim, execution should still proceed; next update will fail and be retried by recovery
        }
      },
    }) as TaskContext;

    await this.emitStatus(taskCtx, task, TaskStatus.RUNNING);

    try {
      let output: any;
      if (task.atomicity === TaskType.COMPOSITE) {
        output = await this.runComposite(task, taskCtx);
      } else {
        const handler = this.registry.get(task.classification);
        log.debug(
          `handler type for ${task.id} is ${handler?.constructor?.name ?? "none"}`
        );
        if (!handler)
          throw new InternalError(
            `No task handler registered for type: ${task.classification}`
          );
        output = await handler.run(task.input, taskCtx);
        log.verbose(`handler finished for ${task.id}`);
      }

      task.status = TaskStatus.SUCCEEDED;
      task.output = output;
      task.error = undefined;
      task.leaseOwner = undefined;
      task.leaseExpiry = undefined;

      task = await this.tasks.update(task, taskCtx);
      taskCtx.logger.info(`task ${task.id} success state ${task.status}`);
      log.info(
        `task ${task.id} success state ${task.status} attempt ${task.attempt}`
      );
      await this.emitStatus(taskCtx, task, TaskStatus.SUCCEEDED, output);
    } catch (err: any) {
      log.error("task execution error", err);
      const nextAttempt = (task.attempt ?? 0) + 1;

      const serialized = serializeError(err);

      if (nextAttempt < task.maxAttempts) {
        const delay = computeBackoffMs(nextAttempt, task.backoff);
        const nextRunAt = new Date(Date.now() + delay);

        task.attempt = nextAttempt;
        task.status = TaskStatus.WAITING_RETRY;
        task.nextRunAt = nextRunAt;
        task.error = serialized;
        task.leaseOwner = undefined;
        task.leaseExpiry = undefined;
        task = await this.tasks.update(task, taskCtx);
        log.warn(
          `task ${task.id} waiting retry state ${task.status} attempt ${task.attempt}`
        );
        await this.emitStatus(taskCtx, task, TaskStatus.WAITING_RETRY);
        await taskCtx.pipe(LogLevel.warn, `Retry scheduled`, {
          nextRunAt,
          delayMs: delay,
          attempt: nextAttempt,
        });
      } else {
        task.attempt = nextAttempt;
        task.status = TaskStatus.FAILED;
        task.error = serialized;
        task.leaseOwner = undefined;
        task.leaseExpiry = undefined;

        task = await this.tasks.update(task, taskCtx);
        log.error(
          `task ${task.id} failed state ${task.status} attempt ${task.attempt}`
        );
        await this.emitStatus(taskCtx, task, TaskStatus.FAILED, serialized);
        await taskCtx.pipe(
          LogLevel.error,
          `Task failed (max attempts reached)`,
          {
            maxAttempts: task.maxAttempts,
          }
        );
      }
    }
  }

  private async runComposite(
    task: TaskModel,
    context: TaskContext
  ): Promise<any> {
    const { ctx } = (
      await this.logCtx([context], task.classification, true)
    ).for(this.runComposite);
    const steps = task.steps ?? [];
    let idx = task.currentStep ?? 0;
    const results = task.stepResults ?? [];

    const cacheResult = (key: string, value: any) => {
      context.cacheResult(key, value);
      if (ctx instanceof TaskContext && ctx !== context) {
        ctx.cacheResult(key, value);
      }
    };

    for (let i = 0; i < results.length; i += 1) {
      const existing = results[i];
      if (existing?.status === TaskStatus.SUCCEEDED) {
        const prevStep = steps[i];
        if (!prevStep) continue;
        const cacheKey = `${task.id}:step:${i}`;
        cacheResult(prevStep.classification, existing.output);
        cacheResult(cacheKey, existing.output);
      }
    }

    while (idx < steps.length) {
      const step = steps[idx];
      const handler = this.registry.get(step.classification);
      if (!handler)
        throw new Error(
          `No task handler registered for composite step: ${step.classification}`
        );

      await ctx.pipe([
        LogLevel.info,
        `Composite step ${idx + 1}/${steps.length}: ${step.classification}`,
      ]);

      try {
        const out = await handler.run(step.input, ctx);

        const stepIndex = idx;
        results[stepIndex] = new TaskStepResultModel({
          status: TaskStatus.SUCCEEDED,
          output: out,
        });
        const cacheKey = `${task.id}:step:${stepIndex}`;
        cacheResult(step.classification, out);
        cacheResult(cacheKey, out);
        idx = stepIndex + 1;

        task.stepResults = results;
        task.currentStep = idx;

        task = await this.tasks.update(task);
        await this.emitProgress(ctx, task.id, {
          currentStep: idx,
          totalSteps: steps.length,
          output: out,
        });
      } catch (err: any) {
        results[idx] = new TaskStepResultModel({
          status: TaskStatus.FAILED,
          error: serializeError(err),
        });
        task.stepResults = results;
        task.currentStep = idx;
        task.error = serializeError(err);

        // persist failure context before throwing (retry logic happens outside)
        task = await this.tasks.update(task);
        throw err;
      }
    }

    return { stepResults: results };
  }

  // -------------------------
  // Events + log tail persistence
  // -------------------------

  private async appendLog(
    ctx: TaskContext | Context,
    task: TaskModel,
    logEntries:
      | [LogLevel, string]
      | [LogLevel, string, any]
      | ([LogLevel, string] | [LogLevel, string, any])[]
  ): Promise<[TaskModel, TaskLogEntryModel[]]> {
    const isMulti = Array.isArray(logEntries) && Array.isArray(logEntries[0]);
    const entries = (isMulti ? logEntries : [logEntries]).map(
      ([level, msg, meta]) => {
        return new TaskLogEntryModel({
          level,
          msg,
          meta,
        });
      }
    );

    const nextTail = [...(task.logTail ?? []), ...entries].slice(
      -this.config.logTailMax
    );
    task.logTail = nextTail;

    try {
      return [await this.tasks.update(task, ctx), entries];
    } catch {
      return [task, []];
    }
  }

  private async emitStatus(
    ctx: TaskContext | Context,
    task: TaskModel,
    status: TaskStatus,
    outputOrError?: any | Error
  ): Promise<void> {
    if (ctx instanceof TaskContext) {
      await ctx.flush();
    }

    const payload: TaskProgressPayload = { status };
    if (outputOrError && outputOrError instanceof TaskErrorModel)
      payload.error = outputOrError;
    else if (outputOrError) payload.output = outputOrError;
    const evt = await this.persistEvent(
      ctx,
      task.id,
      TaskEventType.STATUS,
      payload
    );
    this.bus.emit(evt, ctx);
  }

  private async emitLog(
    ctx: TaskContext | Context,
    taskId: string,
    entries: TaskLogEntryModel[]
  ): Promise<void> {
    const evt = await this.persistEvent(
      ctx,
      taskId,
      TaskEventType.LOG,
      entries.map((e) => ({
        ts: e.ts,
        level: e.level,
        msg: e.msg,
        meta: e.meta,
      }))
    );
    this.bus.emit(evt, ctx);
  }

  private async emitProgress(
    ctx: TaskContext | Context,
    taskId: string,
    data: any
  ): Promise<void> {
    const evt = await this.persistEvent(
      ctx,
      taskId,
      TaskEventType.PROGRESS,
      data
    );
    this.bus.emit(evt, ctx);
  }

  private async persistEvent(
    ctx: TaskContext | Context,
    taskId: string,
    type: TaskEventType,
    payload: any
  ): Promise<TaskEventModel> {
    const evt = new TaskEventModel({ taskId, classification: type, payload });
    return await this.events.create(evt, ctx);
  }

  override toString(): string {
    return `TaskEngine<${this.config.adapter.alias}>`;
  }

  override async context(
    operation:
      | ((...args: any[]) => any)
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    overrides: Partial<FlagsOf<ContextOf<A>>>,
    ...args: any[]
  ): Promise<ContextOf<A>> {
    return this.adapter.context(operation, overrides, TaskModel, ...args);
  }
}
