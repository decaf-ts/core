import { TaskModel } from "./models/TaskModel";
import { Repo } from "../repository/Repository";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventBus } from "./TaskEventBus";
import { Condition } from "../query/Condition";
import { TaskStepResultModel } from "./models/TaskStepResultModel";
import { TaskLogEntryModel } from "./models/TaskLogEntryModel";
import { TaskBackoffModel } from "./models/TaskBackoffModel";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";
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
  ContextualArgs,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { computeBackoffMs, serializeError, sleep } from "./utils";
import { TaskContext } from "./TaskContext";
import {
  TaskStateChangeError,
  TaskStateChangeRequest,
} from "./TaskStateChangeError";
import { DateTarget } from "@decaf-ts/decorator-validation";
import { Constructor } from "@decaf-ts/decoration";
import { TaskLogger } from "./logging";
import {
  TaskEngineConfig,
  TaskEngineAutoShutdownConfig,
  TaskFlags,
  TaskProgressPayload,
} from "./types";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskTracker } from "./TaskTracker";
import { Lock } from "@decaf-ts/transactional-decorators";
import { PersistenceKeys } from "../persistence/index";

type ParsedTaskDependency = {
  taskId: string;
  stepRef?: string;
};

export class TaskEngine<
  A extends Adapter<any, any, any, any>,
  C extends TaskEngineConfig<A> = TaskEngineConfig<A>,
> extends AbsContextual<TaskContext> {
  private _tasks?: Repo<TaskModel>;
  private _events?: Repo<TaskEventModel>;
  private _adapter?: A;

  protected lock = new Lock();

  protected override get Context(): Constructor<ContextOf<A>> {
    return TaskContext as unknown as Constructor<ContextOf<A>>;
  }

  protected get adapter(): A {
    if (!this._adapter) {
      this._adapter = this.config.adapter;
      if (this.config.overrides)
        this._adapter = this.adapter.for(this.config.overrides);
    }
    return this._adapter;
  }

  protected get registry(): TaskHandlerRegistry {
    return this.config.registry!;
  }

  protected get bus(): TaskEventBus {
    return this.config.bus!;
  }

  protected get tasks(): Repo<TaskModel> {
    if (this._tasks) return this._tasks;
    this._tasks = new (this.adapter.repository())(
      this.adapter,
      TaskModel,
      true
    ).override({
      afterQueryHandlers: true,
    });
    return this._tasks;
  }

  protected get events(): Repo<TaskEventModel> {
    if (this._events) return this._events;
    this._events = new (this.adapter.repository())(
      this.adapter,
      TaskEventModel,
      true
    ).override({
      afterQueryHandlers: true,
    });
    return this._events;
  }

  protected running = false;
  private idleDelayMs: number;

  static createTaskContext(
    base?: Context<any>,
    overrides?: Partial<TaskFlags>
  ): TaskContext {
    const ctx = new TaskContext(base);
    if (overrides && Object.keys(overrides).length) {
      return ctx.accumulate(overrides) as TaskContext;
    }
    return ctx;
  }

  constructor(protected config: C) {
    super();
    const autoShutdown = Object.assign(
      {},
      DefaultTaskEngineConfig.autoShutdown,
      config.autoShutdown
    );
    this.config = Object.assign({}, DefaultTaskEngineConfig, config, {
      autoShutdown,
      bus: config.bus || new TaskEventBus(),
      registry: config.registry || new TaskHandlerRegistry(),
    });
    this.idleDelayMs = this.config.pollMsIdle;
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
      ? { task: TaskModel<I, O>; tracker: TaskTracker<O> }
      : TaskModel
  > {
    const { ctx, log } = (
      await this.logCtx(args, OperationKeys.CREATE, true)
    ).for(this.push);
    log.verbose(`pushing task ${task.classification}`);
    const t = await this.tasks.create(task, ctx);
    log.info(`${task.classification} task registered under ${t.id}`);
    if (!track) return t as any;
    const tracker = new TaskTracker<O>(this.bus, t);
    return { task: t, tracker } as any;
  }

  schedule<I, O>(
    task: TaskModel<I, O>,
    ...args: MaybeContextualArg<any>
  ): {
    for: (when: DateTarget) => Promise<TaskModel<I, O>>;
  };
  schedule<I, O>(
    task: TaskModel<I, O>,
    track: false,
    ...args: MaybeContextualArg<any>
  ): {
    for: (when: DateTarget) => Promise<TaskModel<I, O>>;
  };
  schedule<I, O>(
    task: TaskModel<I, O>,
    track: true,
    ...args: MaybeContextualArg<any>
  ): {
    for: (
      when: DateTarget
    ) => Promise<{ task: TaskModel<I, O>; tracker: TaskTracker<O> }>;
  };
  schedule<I, O, TRACK extends boolean>(
    task: TaskModel<I, O>,
    track: TRACK = false as TRACK,
    ...args: MaybeContextualArg<any>
  ): {
    for: (
      when: DateTarget
    ) => Promise<
      TRACK extends true
        ? { task: TaskModel<I, O>; tracker: TaskTracker<O> }
        : TaskModel<I, O>
    >;
  } {
    return {
      for: async (
        when: DateTarget
      ): Promise<
        TRACK extends true
          ? { task: TaskModel<I, O>; tracker: TaskTracker<O> }
          : TaskModel<I, O>
      > => {
        const scheduledTo: Date = when instanceof Date ? when : when.build();
        task.status = TaskStatus.SCHEDULED;
        task.scheduledTo = scheduledTo;
        task.nextRunAt = undefined;
        task.leaseOwner = undefined;
        task.leaseExpiry = undefined;
        return (await this.push(task, track, ...args)) as any;
      },
    };
  }

  async track(id: string, ...args: MaybeContextualArg<any>) {
    const { ctx, log } = (
      await this.logCtx(args, OperationKeys.READ, true)
    ).for(this.track);
    log.verbose(`tracking task ${id}`);
    let task = await this.tasks.read(id, ctx);
    task = await this.ensureTaskError(task, ctx);
    log.info(`${task.classification} task found with id ${id}`);
    const tracker = new TaskTracker<(typeof task)["output"]>(this.bus, task);
    return { task, tracker };
  }

  protected async ensureTaskError(
    task: TaskModel,
    ctx: Context
  ): Promise<TaskModel> {
    if (
      ![TaskStatus.FAILED, TaskStatus.CANCELED].includes(task.status) ||
      task.error
    ) {
      return task;
    }
    let current = task;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sleep(20);
      try {
        const latest = await this.tasks.read(current.id, ctx);
        if (latest.error) return latest;
        current = latest;
      } catch {
        break;
      }
    }
    return current;
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
    const cancelError = new TaskErrorModel({
      message: `Task ${t.id} canceled`,
      code: 400,
    });
    t.error = cancelError;
    t.leaseOwner = undefined;
    t.leaseExpiry = undefined;
    t.nextRunAt = undefined;
    t.scheduledTo = undefined;
    const saved = await this.tasks.update(t, ctx);
    await this.emitStatus(ctx, saved, TaskStatus.CANCELED, cancelError);
    return saved;
  }

  async isRunning(): Promise<boolean> {
    await this.lock.acquire();
    const running = this.running;
    this.lock.release();
    return running;
  }

  async start(...args: MaybeContextualArg<any>): Promise<void> {
    const { ctx } = (await this.logCtx(args, "run", true)).for(this.start);
    await this.lock.acquire();
    if (this.running) return;
    this.running = true;
    this.lock.release();
    this.idleDelayMs = this.config.pollMsIdle;
    void this.loop(ctx);
  }

  async stop(...args: MaybeContextualArg<any>): Promise<void> {
    const { ctx, log } = (
      await this.logCtx(args, PersistenceKeys.SHUTDOWN, true)
    ).for(this.stop);
    await this.lock.acquire();
    if (!this.running)
      log.warn(`stop method called when task engine was not running`);
    this.running = false;
    this.lock.release();

    const runningTasks = await this.tasks
      .select(["id"])
      .where(Condition.attr<TaskModel>("status").eq(TaskStatus.RUNNING))
      .execute(ctx);

    const timeout =
      ctx.getOrUndefined?.("gracefulShutdownMsTimeout") ??
      this.config.gracefulShutdownMsTimeout;

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        log.error(`Graceful shutdown interrupted after ${timeout} ms...`);
        resolve();
      }, timeout);

      Promise.allSettled(
        runningTasks.map(
          ({ id }) =>
            new Promise((resolve, reject) => {
              this.track(id, ctx)
                .then(({ tracker }) => {
                  tracker.resolve().then(resolve);
                })
                .catch(reject);
            })
        )
      )
        .then((result) => {
          clearTimeout(timer);
          log.info(
            `Graceful shutdown completed before expiry. concluded ${result.length} tasks`
          );
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // -------------------------
  // Worker loop
  // -------------------------

  protected async loop(...args: ContextualArgs<any>): Promise<void> {
    const { ctx } = this.logCtx(args, this.loop);
    const autoShutdownConfig: TaskEngineAutoShutdownConfig = this.config
      .autoShutdown ?? {
      enabled: false,
      backoffStepMs: 0,
      maxIdleDelayMs: this.config.pollMsIdle,
    };
    const maxIdleDelay = Math.max(
      autoShutdownConfig.maxIdleDelayMs ?? this.config.pollMsIdle,
      this.config.pollMsIdle
    );
    const backoffStepMs = autoShutdownConfig.backoffStepMs ?? 0;

    while (await this.isRunning()) {
      const claimed = await this.claimBatch(ctx);
      await Promise.allSettled(claimed.map((t) => this.executeClaimed(t)));

      const idle = claimed.length === 0;
      if (idle) {
        if (autoShutdownConfig.enabled) {
          this.idleDelayMs = Math.min(
            this.idleDelayMs + backoffStepMs,
            maxIdleDelay
          );
          if (this.idleDelayMs >= maxIdleDelay) {
            ctx.logger.info(
              `auto-shutdown triggered after ${this.idleDelayMs}ms idle polling`
            );
            await this.stop(ctx);
            return;
          }
        } else {
          this.idleDelayMs = this.config.pollMsIdle;
        }
      } else {
        this.idleDelayMs = this.config.pollMsIdle;
      }

      const waitMs = idle ? this.idleDelayMs : this.config.pollMsBusy;
      await sleep(Math.max(waitMs, 0));
    }
  }

  protected async claimBatch(ctx: Context<any>): Promise<TaskModel[]> {
    const log = ctx.logger.for(this.claimBatch);
    const now = new Date();

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

    const condScheduled = Condition.attribute<TaskModel>("status")
      .eq(TaskStatus.SCHEDULED)
      .and(Condition.attribute<TaskModel>("scheduledTo").lte(now));

    const runnable = condPending
      .or(condRetry)
      .or(condLeaseExpired)
      .or(condScheduled);

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

  protected async tryClaim(
    task: TaskModel,
    ctx: Context
  ): Promise<TaskModel | null> {
    const log = ctx.logger.for(this.claimBatch);
    const now = new Date().getTime();

    let source: TaskModel = task;
    try {
      source = await this.tasks.read(task.id, ctx);
    } catch {
      // fallback to candidate payload
    }

    const runnable = await this.isRunnable(source, ctx);
    if (!runnable) return null;

    const claimed = new TaskModel({
      ...source,
      status: TaskStatus.RUNNING,
      leaseOwner: this.config.workerId.toString(),
      leaseExpiry: new Date(
        now + (parseInt(this.config.leaseMs.toString()) || 60_000)
      ),
      scheduledTo: undefined,
      nextRunAt: undefined,
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

  protected isTaskFinished(status?: TaskStatus): boolean {
    return [
      TaskStatus.SUCCEEDED,
      TaskStatus.FAILED,
      TaskStatus.CANCELED,
    ].includes(status as TaskStatus);
  }

  protected parseTaskDependency(
    value: string
  ): ParsedTaskDependency | undefined {
    const raw = value?.trim();
    if (!raw) return undefined;
    const sep = raw.lastIndexOf(":");
    if (sep <= 0 || sep >= raw.length - 1) return { taskId: raw };
    const taskId = raw.slice(0, sep).trim();
    const stepRef = raw.slice(sep + 1).trim();
    if (!taskId || !stepRef) return { taskId: raw };
    return { taskId, stepRef };
  }

  protected normalizeDependencies(
    deps: string[] | string | undefined
  ): ParsedTaskDependency[] {
    if (!deps) return [];
    let payload: any = deps;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = [payload];
      }
    }
    if (payload instanceof Set) payload = Array.from(payload);
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((value) => typeof value === "string")
      .map((value) => this.parseTaskDependency(value))
      .filter(Boolean) as ParsedTaskDependency[];
  }

  protected resolveDependencyStepIndex(
    task: TaskModel,
    stepRef: string
  ): number | undefined {
    const trimmed = stepRef.trim();
    if (!trimmed) return undefined;
    const numeric = Number(trimmed);
    if (Number.isInteger(numeric) && numeric >= 0) return numeric;
    const steps = this.normalizeSteps(task.steps);
    const index = steps.findIndex(
      (step) => step.name === trimmed || step.classification === trimmed
    );
    return index >= 0 ? index : undefined;
  }

  protected async areDependenciesSatisfied(
    dependencies: ParsedTaskDependency[],
    ctx: Context
  ): Promise<boolean> {
    if (!dependencies.length) return true;
    const taskIds = Array.from(new Set(dependencies.map((dep) => dep.taskId)));
    const dependencyTasks = new Map<string, TaskModel>();
    try {
      const loaded = await this.tasks.readAll(taskIds, ctx);
      for (const task of loaded) {
        if (task?.id) dependencyTasks.set(task.id, task);
      }
    } catch {
      return false;
    }

    for (const dep of dependencies) {
      try {
        const depTask = dependencyTasks.get(dep.taskId);
        if (!depTask) return false;
        if (!dep.stepRef) {
          if (!this.isTaskFinished(depTask.status)) return false;
          continue;
        }
        const depStep = this.resolveDependencyStepIndex(depTask, dep.stepRef);
        if (depStep == null) return false;
        const stepResults = this.normalizeStepResults(depTask.stepResults);
        const stepResult = stepResults[depStep];
        if (!stepResult || !this.isTaskFinished(stepResult.status))
          return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  protected getStepLock(
    task: TaskModel,
    stepIndex: number | undefined
  ): string | undefined {
    if (task.atomicity !== TaskType.COMPOSITE) return undefined;
    const steps = this.normalizeSteps(task.steps);
    if (!steps.length) return undefined;
    const index = stepIndex == null ? 0 : stepIndex;
    const step = steps[index];
    return step?.lock;
  }

  protected async hasLockConflict(
    task: TaskModel,
    stepIndex: number | undefined,
    ctx: Context
  ): Promise<boolean> {
    const candidateLocks = [
      task.lock,
      this.getStepLock(task, stepIndex),
    ].filter((value): value is string => !!value && typeof value === "string");
    if (!candidateLocks.length) return false;

    const runningTasks = await this.tasks
      .select()
      .where(Condition.attribute<TaskModel>("status").eq(TaskStatus.RUNNING))
      .execute(ctx);
    for (const running of runningTasks) {
      if (running.id === task.id) continue;
      const runningLocks = [
        running.lock,
        this.getStepLock(running, running.currentStep),
      ].filter(
        (value): value is string => !!value && typeof value === "string"
      );
      if (runningLocks.some((lock) => candidateLocks.includes(lock))) {
        return true;
      }
    }
    return false;
  }

  protected async isRunnable(task: TaskModel, ctx: Context): Promise<boolean> {
    const dependencies = this.normalizeDependencies(task.dependencies);
    const dependenciesSatisfied = await this.areDependenciesSatisfied(
      dependencies,
      ctx
    );
    if (!dependenciesSatisfied) return false;

    const stepIndex =
      task.atomicity === TaskType.COMPOSITE
        ? (task.currentStep ?? 0)
        : undefined;
    return !(await this.hasLockConflict(task, stepIndex, ctx));
  }

  // -------------------------
  // Execution
  // -------------------------

  protected async executeClaimed(task: TaskModel): Promise<void> {
    const { ctx, log } = (await this.logCtx([], task.classification, true)).for(
      this.executeClaimed
    );
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const engine = this;
    let logPipeQueue: Promise<void> = Promise.resolve();
    const taskCtx: TaskContext = new TaskContext(ctx).accumulate({
      taskId: task.id,
      logger: new TaskLogger(
        log,
        this.config.streamBufferSize,
        this.config.maxLoggingBuffer
      ),
      attempt: task.attempt,
      resultCache: { "task.attempt": task.attempt },
      pipe: async function (this: TaskContext, ...args: any[]): Promise<void> {
        const normalized = engine.normalizePipeArgs(args);
        if (!normalized.length) return;
        logPipeQueue = logPipeQueue.then(async () => {
          const [updated, logs] = await engine.appendLog(
            this,
            task,
            normalized
          );
          // Keep the original task object reference updated so composite execution doesn't
          // overwrite logTail with stale state.
          Object.assign(task, updated);
          await engine.emitLog(this, task.id, logs);
        });
        await logPipeQueue;
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
    let activeHandler:
      | {
          catch?: (
            input: any,
            error: unknown,
            ctx: TaskContext
          ) => Promise<void>;
        }
      | undefined;
    let activeInput: any;

    try {
      let output: any;
      if (task.atomicity === TaskType.COMPOSITE) {
        output = await this.runComposite(task, taskCtx);
        try {
          const latest = await this.tasks.read(task.id, taskCtx);
          Object.assign(task, latest);
        } catch {
          // keep best-effort task state
        }
        if (output?.stepResults) {
          task.stepResults = output.stepResults;
          task.currentStep = output.stepResults.length;
        }
      } else {
        const handler = this.registry.get(task.classification);
        activeHandler = handler;
        activeInput = task.input;
        log.debug(
          `handler type for ${task.id} is ${handler?.constructor?.name ?? "none"}`
        );
        if (!handler)
          throw new InternalError(
            `No task handler registered for type: ${task.classification}`
          );
        output = await handler.run(task.input, taskCtx);
        // TaskHandlers shouldn't need to explicitly call ctx.flush().
        // Flush buffered logs before we persist final task state.
        await taskCtx.flush();
        log.verbose(`handler finished for ${task.id}`);
      }

      task.status = TaskStatus.SUCCEEDED;
      task.output = output;
      task.error = undefined;
      task.leaseOwner = undefined;
      task.leaseExpiry = undefined;

      const persisted = await this.tasks.update(task, taskCtx);
      Object.assign(task, persisted);
      taskCtx.logger.info(`task ${task.id} success state ${task.status}`);
      log.info(
        `task ${task.id} success state ${task.status} attempt ${task.attempt}`
      );
      await this.emitStatus(taskCtx, task, TaskStatus.SUCCEEDED, output);
    } catch (err: any) {
      // Ensure buffered handler logs are persisted before we emit any engine-generated logs/events.
      // This preserves chronological ordering when TaskHandlers don't call ctx.flush().
      try {
        await taskCtx.flush();
      } catch {
        // best-effort
      }
      try {
        const latest = await this.tasks.read(task.id, taskCtx);
        Object.assign(task, latest);
      } catch {
        // keep best-effort task state for retries/failures
      }
      if (err instanceof TaskStateChangeError) {
        await this.handleTaskStateChange(err.request, task, taskCtx);
        return;
      }
      try {
        await activeHandler?.catch?.(activeInput, err, taskCtx);
      } catch (catchErr: unknown) {
        log.error("task handler catch() hook failed", catchErr as Error);
      }
      log.error("task execution error", err);
      if (task.atomicity === TaskType.COMPOSITE) {
        const normalizedResults = this.normalizeStepResults(task.stepResults);
        task.stepResults = normalizedResults;
        if (task.currentStep == null) {
          const failedIdx = normalizedResults.findIndex(
            (step) => step.status === TaskStatus.FAILED
          );
          if (failedIdx >= 0) task.currentStep = failedIdx;
        }
      }
      const nextAttempt = (task.attempt ?? 0) + 1;

      const serialized = serializeError(err);

      if (nextAttempt < task.maxAttempts) {
        const delay = computeBackoffMs(
          nextAttempt,
          this.normalizeBackoff(task.backoff)
        );
        const nextRunAt = new Date(Date.now() + delay);

        task.attempt = nextAttempt;
        task.status = TaskStatus.WAITING_RETRY;
        task.nextRunAt = nextRunAt;
        task.error = serialized;
        task.leaseOwner = undefined;
        task.leaseExpiry = undefined;
        const persisted = await this.tasks.update(task, taskCtx);
        Object.assign(task, persisted);
        log.warn(
          `task ${task.id} waiting retry state ${task.status} attempt ${task.attempt}`
        );
        await taskCtx.pipe(LogLevel.warn, `Retry scheduled`, {
          nextRunAt,
          delayMs: delay,
          attempt: nextAttempt,
        });
        await this.emitStatus(
          taskCtx,
          task,
          TaskStatus.WAITING_RETRY,
          serialized,
          err
        );
      } else {
        task.attempt = nextAttempt;
        task.status = TaskStatus.FAILED;
        task.error = serialized;
        task.leaseOwner = undefined;
        task.leaseExpiry = undefined;

        const persisted = await this.tasks.update(task, taskCtx);
        Object.assign(task, persisted);
        log.error(
          `task ${task.id} failed state ${task.status} attempt ${task.attempt}`
        );
        await taskCtx.pipe(
          LogLevel.error,
          `Task failed (max attempts reached)`,
          {
            maxAttempts: task.maxAttempts,
          }
        );
        await this.emitStatus(
          taskCtx,
          task,
          TaskStatus.FAILED,
          serialized,
          err
        );
      }
    }
  }

  protected async handleTaskStateChange(
    request: TaskStateChangeRequest,
    task: TaskModel,
    ctx: TaskContext
  ): Promise<void> {
    task.leaseOwner = undefined;
    task.leaseExpiry = undefined;
    switch (request.status) {
      case TaskStatus.CANCELED: {
        const cancelError =
          request.error ??
          new TaskErrorModel({
            message: `Task ${task.id} canceled`,
          });
        task.status = TaskStatus.CANCELED;
        task.error = cancelError;
        task.nextRunAt = undefined;
        task.scheduledTo = undefined;
        task = await this.tasks.update(task, ctx);
        await this.emitStatus(ctx, task, TaskStatus.CANCELED, cancelError);
        await ctx.pipe(LogLevel.warn, `Task canceled via context`);
        return;
      }
      case TaskStatus.WAITING_RETRY: {
        const nextAttempt = (task.attempt ?? 0) + 1;
        const backoff = this.normalizeBackoff(task.backoff);
        const delay = computeBackoffMs(nextAttempt, backoff);
        const nextRunAt =
          request.scheduledTo instanceof Date
            ? request.scheduledTo
            : new Date(Date.now() + delay);
        const retryError =
          request.error ??
          new TaskErrorModel({
            message: `Task ${task.id} requested retry`,
          });
        task.status = TaskStatus.WAITING_RETRY;
        task.attempt = nextAttempt;
        task.error = retryError;
        task.nextRunAt = nextRunAt;
        task.scheduledTo = undefined;
        task = await this.tasks.update(task, ctx);
        await this.emitStatus(ctx, task, TaskStatus.WAITING_RETRY, retryError);
        await ctx.pipe(LogLevel.warn, `Retry requested`, {
          nextRunAt,
          delayMs: delay,
          attempt: nextAttempt,
        });
        return;
      }
      case TaskStatus.SCHEDULED: {
        if (!request.scheduledTo)
          throw new InternalError("Scheduled state requires a target date");
        const rescheduleError =
          request.error ??
          new TaskErrorModel({
            message: `Task ${task.id} rescheduled`,
          });
        task.status = TaskStatus.SCHEDULED;
        task.scheduledTo = request.scheduledTo;
        task.error = rescheduleError;
        task.nextRunAt = undefined;
        task = await this.tasks.update(task, ctx);
        await this.emitStatus(ctx, task, TaskStatus.SCHEDULED, rescheduleError);
        await ctx.pipe(LogLevel.info, `Task rescheduled`, {
          scheduledTo: request.scheduledTo.toISOString(),
        });
        return;
      }
      default:
        throw new InternalError(
          `Unsupported task state change requested: ${request.status}`
        );
    }
  }

  protected async runComposite(
    task: TaskModel,
    context: TaskContext
  ): Promise<any> {
    const { ctx } = (
      await this.logCtx([context], task.classification, true)
    ).for(this.runComposite);
    let steps = this.normalizeSteps(task.steps);
    let idx = task.currentStep ?? 0;
    const results = this.normalizeStepResults(task.stepResults);

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
      context.setStep(idx);
      const step = steps[idx];
      const handler = this.registry.get(step.classification);
      if (!handler)
        throw new Error(
          `No task handler registered for composite step: ${step.classification}`
        );

      const dependencies = this.normalizeDependencies(step.dependsOn);
      const dependenciesSatisfied = await this.areDependenciesSatisfied(
        dependencies,
        context
      );
      if (!dependenciesSatisfied) {
        context.reschedule(
          new Date(Date.now() + this.config.pollMsIdle),
          `Waiting dependencies for step ${idx} (${step.classification})`
        );
      }

      const lockConflict = await this.hasLockConflict(task, idx, context);
      if (lockConflict) {
        context.reschedule(
          new Date(Date.now() + this.config.pollMsIdle),
          `Waiting lock for step ${idx} (${step.classification})`
        );
      }

      task.currentStep = idx;
      const persistedCurrent = await this.tasks.update(task);
      Object.assign(task, persistedCurrent);
      await context.progress({
        currentStep: idx,
        totalSteps: steps.length,
      });

      const stepIndex = idx;
      context.cache.put(
        "scheduleCompositeSteps",
        async (newSteps: TaskStepSpecModel[]) => {
          const normalizedNewSteps = this.normalizeSteps(newSteps);
          if (!normalizedNewSteps.length) return;
          const currentSteps = this.normalizeSteps(task.steps);
          const insertionIndex = Math.min(stepIndex + 1, currentSteps.length);
          currentSteps.splice(insertionIndex, 0, ...normalizedNewSteps);
          task.steps = currentSteps;
          const persisted = await this.tasks.update(task, context);
          Object.assign(task, persisted);
          steps = this.normalizeSteps(task.steps);
          const updateEvent = await this.persistEvent(
            context,
            task.id,
            TaskEventType.UPDATE,
            {
              status: "update",
              currentStep: stepIndex,
              totalSteps: steps.length,
              output: {
                added: normalizedNewSteps.length,
                insertionIndex,
              },
            }
          );
          this.bus.emit(updateEvent, context);
        }
      );

      await context.pipe([
        LogLevel.info,
        `Composite step ${idx + 1}/${steps.length}: ${step.classification}`,
      ]);

      try {
        const out = await handler.run(step.input, context);
        // Ensure step-tagged logs are flushed before advancing the step pointer.
        await context.flush();

        const now = new Date();
        results[stepIndex] = new TaskStepResultModel({
          status: TaskStatus.SUCCEEDED,
          output: out,
          createdAt: now,
          updatedAt: now,
        });
        const cacheKey = `${task.id}:step:${stepIndex}`;
        cacheResult(step.classification, out);
        cacheResult(cacheKey, out);
        idx = stepIndex + 1;

        task.stepResults = results;
        task.currentStep = idx;

        const persisted = await this.tasks.update(task);
        Object.assign(task, persisted);
        await this.emitProgress(context, task.id, {
          currentStep: idx,
          totalSteps: steps.length,
          output: out,
        });
      } catch (err: any) {
        try {
          await handler.catch?.(step.input, err, context);
        } catch (catchErr) {
          ctx.logger.warn("composite step catch() hook failed", {
            error: catchErr,
          });
        }
        const now = new Date();
        results[idx] = new TaskStepResultModel({
          status: TaskStatus.FAILED,
          error: serializeError(err),
          createdAt: now,
          updatedAt: now,
        });
        task.stepResults = results;
        task.currentStep = idx;
        task.error = serializeError(err);

        // persist failure context before throwing (retry logic happens outside)
        const persisted = await this.tasks.update(task);
        Object.assign(task, persisted);
        throw err;
      }
    }

    return { stepResults: results };
  }

  protected normalizeBackoff(
    backoff: TaskBackoffModel | string | object | any
  ) {
    if (backoff instanceof TaskBackoffModel) return backoff;
    let payload: any = backoff ?? {};
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = {};
      }
    }
    return new TaskBackoffModel(payload);
  }

  protected normalizeSteps(
    steps: TaskStepSpecModel[] | string | undefined
  ): TaskStepSpecModel[] {
    if (!steps) return [];
    let payload: any = steps;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return [];
      }
    }
    if (payload instanceof Set) payload = Array.from(payload);
    if (!Array.isArray(payload)) return [];
    return payload.map((step) => {
      if (step instanceof TaskStepSpecModel) return step;
      let value: any = step;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      }
      return new TaskStepSpecModel(value);
    });
  }

  protected normalizeStepResults(
    results: TaskStepResultModel[] | string | undefined
  ): TaskStepResultModel[] {
    if (!results) return [];
    let payload: any = results;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return [];
      }
    }
    if (payload instanceof Set) payload = Array.from(payload);
    if (!Array.isArray(payload)) return [];
    return payload.map((result) => {
      if (result instanceof TaskStepResultModel) return result;
      let value: any = result;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = {};
        }
      }
      return new TaskStepResultModel(value);
    });
  }

  // -------------------------
  // Events + log tail persistence
  // -------------------------

  protected async appendLog(
    ctx: TaskContext | Context,
    task: TaskModel,
    logEntries:
      | [LogLevel, string]
      | [LogLevel, string, any]
      | ([LogLevel, string] | [LogLevel, string, any])[]
  ): Promise<[TaskModel, TaskLogEntryModel[]]> {
    const isMulti = Array.isArray(logEntries) && Array.isArray(logEntries[0]);
    const step =
      task.atomicity === TaskType.COMPOSITE
        ? ctx instanceof TaskContext
          ? (ctx.step ?? task.currentStep)
          : task.currentStep
        : undefined;
    const entries = (isMulti ? logEntries : [logEntries]).map(
      ([level, msg, meta]) => {
        return new TaskLogEntryModel({
          level,
          msg,
          meta,
          step,
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

  protected async emitStatus(
    ctx: TaskContext | Context,
    task: TaskModel,
    status: TaskStatus,
    outputOrError?: any | Error,
    originalError?: Error
  ): Promise<void> {
    if (ctx instanceof TaskContext) {
      await ctx.flush();
    }

    const payload: TaskProgressPayload = { status };
    if (outputOrError && outputOrError instanceof TaskErrorModel)
      payload.error = outputOrError;
    else if (outputOrError) payload.output = outputOrError;
    if (task.nextRunAt) payload.nextRunAt = task.nextRunAt;
    if (task.scheduledTo) payload.scheduledTo = task.scheduledTo;
    const persisted = await this.persistEvent(
      ctx,
      task.id,
      TaskEventType.STATUS,
      payload
    );
    const emittedPayload =
      originalError !== undefined
        ? Object.assign({}, payload, { originalError })
        : payload;
    const emitted = new TaskEventModel({
      ...persisted,
      payload: emittedPayload,
    });
    this.bus.emit(emitted, ctx);
  }

  protected async emitLog(
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
        step: e.step,
      }))
    );
    this.bus.emit(evt, ctx);
  }

  protected normalizePipeArgs(
    args: any[]
  ): ([LogLevel, string] | [LogLevel, string, any])[] {
    if (!args.length) return [];

    if (args.length === 1) {
      const value = args[0];
      if (!Array.isArray(value)) return [];
      if (value.length === 0) return [];
      // Either [level,msg,meta?] or [[level,msg,meta?], ...]
      if (Array.isArray(value[0])) {
        return (value as any[]).filter(Array.isArray) as any;
      }
      return [value as any];
    }

    const [level, msg, meta] = args;
    if (typeof level !== "string" || typeof msg !== "string") return [];
    return [[level as LogLevel, msg, meta] as any];
  }

  protected async emitProgress(
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

  protected async persistEvent(
    ctx: TaskContext | Context,
    taskId: string,
    type: TaskEventType,
    payload: any
  ): Promise<TaskEventModel> {
    const evt = new TaskEventModel({ taskId, classification: type, payload });
    const created = await this.events.create(evt, ctx);
    return created;
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
