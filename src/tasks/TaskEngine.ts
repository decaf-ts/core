import { TaskModel } from "./models/TaskModel";
import { Repo, Repository } from "../repository/Repository";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventBus } from "./TaskEventBus";
import { TaskBackoffModel } from "./models/TaskBackoffModel";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";
import { Condition } from "../query/Condition";
import { TaskStepResultModel } from "./models/TaskStepResultModel";
import { TaskLogEntryModel } from "./models/TaskLogEntryModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskEventType,
  TaskStatus,
  TaskType,
} from "./constants";
import { Adapter, ContextOf } from "../persistence/index";
import { LogLevel } from "@decaf-ts/logging";
import { ContextualLoggedClass } from "../utils/ContextualLoggedClass";
import { InternalError } from "@decaf-ts/db-decorators";
import { computeBackoffMs, serializeError, sleep } from "./utils";
import { TaskContext } from "./TaskContext";

export type TaskEngineConfig<A extends Adapter<any, any, any, any>> = {
  adapter: A;
  bus: TaskEventBus;
  registry: TaskHandlerRegistry;
  workerId: string;
  concurrency: number;
  leaseMs: number;
  pollMsIdle: number;
  pollMsBusy: number;
  logTailMax: number;
};

export const DefaultTaskEngineConfig: TaskEngineConfig<any> = {
  workerId: "default-worker",
  concurrency: 10,
  leaseMs: 60000,
  pollMsIdle: 1000,
  pollMsBusy: 500,
  logTailMax: 100,
} as TaskEngineConfig<any>;

export class TaskEngine<
  A extends Adapter<any, any, any, any>,
> extends ContextualLoggedClass<ContextOf<A>> {
  private _tasks?: Repo<TaskModel>;
  private _events?: Repo<TaskEventModel>;

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
    this._tasks = Repository.forModel(TaskModel, this.config.adapter.alias);
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

  async enqueueAtomic(arg: {
    id: string;
    input?: any;
    name?: string;
    maxAttempts?: number;
    backoff?: Partial<TaskBackoffModel>;
  }): Promise<TaskModel> {
    const doc = new TaskModel({
      id: arg.id,
      type: TaskType.ATOMIC,
      name: arg.name,
      status: TaskStatus.PENDING,
      input: arg.input,
      attempt: 0,
      maxAttempts: arg.maxAttempts ?? 5,
      backoff: {
        strategy: arg.backoff?.strategy ?? BackoffStrategy.EXPONENTIAL,
        baseMs: arg.backoff?.baseMs ?? 1000,
        maxMs: arg.backoff?.maxMs ?? 60_000,
        jitter: arg.backoff?.jitter ?? JitterStrategy.FULL,
      },
      logTail: [],
    });

    return await this.tasks.create(doc);
  }

  async enqueueComposite(arg: {
    id: string;
    name?: string;
    steps: Array<{ type: string; input?: any }>;
    maxAttempts?: number;
    backoff?: Partial<TaskBackoffModel>;
  }): Promise<TaskModel> {
    const doc = new TaskModel({
      id: arg.id,
      type: TaskType.COMPOSITE,
      name: arg.name,
      status: TaskStatus.PENDING,
      attempt: 0,
      maxAttempts: arg.maxAttempts ?? 5,
      backoff: new TaskBackoffModel({
        strategy: arg.backoff?.strategy ?? BackoffStrategy.EXPONENTIAL,
        baseMs: arg.backoff?.baseMs ?? 1000,
        maxMs: arg.backoff?.maxMs ?? 60_000,
        jitter: arg.backoff?.jitter ?? JitterStrategy.FULL,
      }),
      steps: arg.steps.map(
        (s) => new TaskStepSpecModel({ type: s.type, input: s.input })
      ),
      currentStep: 0,
      stepResults: [],
      logTail: [],
    });

    return await this.tasks.create(doc);
  }

  async getTask(id: string): Promise<TaskModel> {
    return await this.tasks.read(id);
  }

  async cancelTask(id: string): Promise<TaskModel> {
    const t = await this.tasks.read(id);
    if (t.status === TaskStatus.SUCCEEDED || t.status === TaskStatus.FAILED)
      return t;
    t.status = TaskStatus.CANCELED;
    t.leaseOwner = undefined;
    t.leaseExpiry = undefined;
    const saved = await this.tasks.update(t);
    await this.emitStatus(saved, TaskStatus.CANCELED);
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
      const claimed = await this.claimBatch();
      await Promise.allSettled(claimed.map((t) => this.executeClaimed(t)));
      await sleep(
        claimed.length ? this.config.pollMsBusy : this.config.pollMsIdle
      );
    }
  }

  private async claimBatch(): Promise<TaskModel[]> {
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

    const runnable = condPending.or(condRetry).or(condLeaseExpired);

    // Fetch more than concurrency because some will fail to claim due to conflicts
    const candidates: TaskModel[] = await this.tasks
      .select()
      .where(runnable)
      .limit(Math.max(this.config.concurrency * 4, 20))
      .execute();

    const out: TaskModel[] = [];
    for (const c of candidates) {
      const claimed = await this.tryClaim(c);
      if (claimed) out.push(claimed);
      if (out.length >= this.config.concurrency) break;
    }
    return out;
  }

  private async tryClaim(task: TaskModel): Promise<TaskModel | null> {
    const now = Date.now();
    const claimed = new TaskModel({
      ...task,
      status: TaskStatus.RUNNING,
      leaseOwner: this.config.workerId,
      leaseExpiry: new Date(now + this.config.leaseMs),
    });

    try {
      // optimistic update; conflict errors depend on adapter implementation
      return await this.tasks.update(claimed);
    } catch {
      return null;
    }
  }

  // -------------------------
  // Execution
  // -------------------------

  private async executeClaimed(task: TaskModel): Promise<void> {
    const taskId = task.id;

    const ctx: TaskContext = new TaskContext().accumulate({
      taskId,
      attempt: task.attempt,
      log: async (level: LogLevel, msg: string, meta: any) => {
        task = await this.appendLog(task, level, msg, meta);
        await this.emitLog(taskId, level, msg, meta);
      },
      progress: async (data: any) => {
        await this.emitProgress(taskId, data);
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
    }) as any;

    await this.emitStatus(task, TaskStatus.RUNNING);

    try {
      let output: any;

      if (task.type === TaskType.COMPOSITE) {
        output = await this.runComposite(task, ctx);
      } else {
        const handler = this.registry.get(task.type);
        if (!handler)
          throw new InternalError(
            `No task handler registered for type: ${task.type}`
          );
        output = await handler.run(task.input, ctx);
      }

      task.status = TaskStatus.SUCCEEDED;
      task.output = output;
      task.error = undefined;
      task.leaseOwner = undefined;
      task.leaseExpiry = undefined;

      task = await this.tasks.update(task);
      await this.emitStatus(task, TaskStatus.SUCCEEDED);
    } catch (err: any) {
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

        task = await this.tasks.update(task);
        await this.emitStatus(task, TaskStatus.WAITING_RETRY);
        await ctx.log(LogLevel.warn, `Retry scheduled`, {
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

        task = await this.tasks.update(task);
        await this.emitStatus(task, TaskStatus.FAILED);
        await ctx.log(LogLevel.error, `Task failed (max attempts reached)`, {
          maxAttempts: task.maxAttempts,
        });
      }
    }
  }

  private async runComposite(task: TaskModel, ctx: TaskContext): Promise<any> {
    const steps = task.steps ?? [];
    let idx = task.currentStep ?? 0;
    const results = task.stepResults ?? [];

    while (idx < steps.length) {
      const step = steps[idx];
      const handler = this.registry.get(step.type);
      if (!handler)
        throw new Error(
          `No task handler registered for composite step: ${step.type}`
        );

      await ctx.log(
        LogLevel.info,
        `Composite step ${idx + 1}/${steps.length}: ${step.type}`
      );

      try {
        const out = await handler.run(step.input, ctx);

        results[idx] = new TaskStepResultModel({
          status: TaskStatus.SUCCEEDED,
          output: out,
        });
        idx += 1;

        task.stepResults = results;
        task.currentStep = idx;

        task = await this.tasks.update(task);
        await this.emitProgress(task.id, {
          currentStep: idx,
          totalSteps: steps.length,
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
    task: TaskModel,
    level: LogLevel,
    msg: string,
    meta?: any
  ): Promise<TaskModel> {
    const entry = new TaskLogEntryModel({
      level,
      msg,
      meta,
    });

    const nextTail = [...(task.logTail ?? []), entry].slice(
      -this.config.logTailMax
    );
    task.logTail = nextTail;

    try {
      return await this.tasks.update(task);
    } catch {
      return task;
    }
  }

  private async emitStatus(task: TaskModel, status: TaskStatus): Promise<void> {
    const evt = await this.persistEvent(task.id, TaskEventType.STATUS, {
      status,
    });
    this.bus.emit(evt);
  }

  private async emitLog(
    taskId: string,
    level: string,
    msg: string,
    meta?: any
  ): Promise<void> {
    const evt = await this.persistEvent(taskId, TaskEventType.LOG, {
      level,
      msg,
      meta,
    });
    this.bus.emit(evt);
  }

  private async emitProgress(taskId: string, data: any): Promise<void> {
    const evt = await this.persistEvent(taskId, TaskEventType.PROGRESS, data);
    this.bus.emit(evt);
  }

  private async persistEvent(
    taskId: string,
    type: TaskEventType,
    payload: any
  ): Promise<TaskEventModel> {
    const evt = new TaskEventModel({ taskId, type, payload });
    return await this.events.create(evt);
  }

  override toString(): string {
    return `TaskEngine<${this.config.adapter.alias}>`;
  }
}
