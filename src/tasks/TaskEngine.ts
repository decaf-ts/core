import { TaskModel } from "./models/TaskModel";
import { Repo, Repository } from "../repository/Repository";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventBus } from "./TaskEventBus";
import { Condition } from "../query/Condition";
import { TaskStepResultModel } from "./models/TaskStepResultModel";
import { TaskLogEntryModel } from "./models/TaskLogEntryModel";
import { TaskBackoffModel } from "./models/TaskBackoffModel";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";
import { Worker } from "worker_threads";
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
  TaskFlags,
  TaskProgressPayload,
  WorkThreadPoolConfig,
} from "./types";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskTracker } from "./TaskTracker";
import { Lock } from "@decaf-ts/transactional-decorators";
import { PersistenceKeys, UUID } from "../persistence/index";

type TaskWorkerThread = {
  id: string;
  worker: Worker;
  ready: boolean;
  activeJobs: number;
  capacity: number;
  readyPromise?: Promise<void>;
  resolveReady?: () => void;
  rejectReady?: (error: Error) => void;
};

type WorkerJobState = {
  id: string;
  classification: string;
  input: any;
  task: TaskModel;
  ctx: TaskContext;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  worker?: TaskWorkerThread;
};
import {
  WorkThreadEnvironmentShape,
  DefaultWorkThreadEnvironment,
  WorkThreadModulesConfig,
} from "./workers/WorkThreadEnvironment";
import {
  MainToWorkerMessage,
  WorkerJobPayload,
  WorkerLogEntry,
  WorkerToMainMessage,
} from "./workers/messages";

export class TaskEngine<
  A extends Adapter<any, any, any, any>,
> extends AbsContextual<ContextOf<A>> {
  private _tasks?: Repo<TaskModel>;
  private _events?: Repo<TaskEventModel>;
  private workerPoolConfig?: WorkThreadPoolConfig;
  private workerThreads: TaskWorkerThread[] = [];
  private workerJobQueue: WorkerJobState[] = [];
  private workerJobs = new Map<string, WorkerJobState>();
  private workerCounter = 0;
  private workerThreadCapacity = 1;

  private lock = new Lock();

  protected override get Context(): Constructor<ContextOf<A>> {
    return TaskContext as unknown as Constructor<ContextOf<A>>;
  }

  protected get adapter() {
    return this.config.adapter;
  }

  protected get registry(): TaskHandlerRegistry {
    return this.config.registry!;
  }

  protected get bus(): TaskEventBus {
    return this.config.bus!;
  }

  protected get tasks(): Repo<TaskModel> {
    if (this._tasks) return this._tasks;
    this._tasks = Repository.forModel(TaskModel, this.adapter.alias);
    if (this.config.overrides)
      this._tasks = this._tasks.override(this.config.overrides);
    return this._tasks;
  }

  protected get events(): Repo<TaskEventModel> {
    if (this._events) return this._events;
    this._events = Repository.forModel(
      TaskEventModel,
      this.config.adapter.alias
    );
    if (this.config.overrides)
      this._events = this._events.override(this.config.overrides);
    return this._events;
  }

  protected running = false;

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

  constructor(private config: TaskEngineConfig<A>) {
    super();
    if (config.workerPool && !config.workerAdapter) {
      throw new InternalError(
        "Worker pool requires workerAdapter descriptor in TaskEngineConfig"
      );
    }
    this.config = Object.assign({}, DefaultTaskEngineConfig, config, {
      bus: config.bus || new TaskEventBus(),
      registry: config.registry || new TaskHandlerRegistry(),
    });
    this.workerThreadCapacity = Math.max(1, this.config.workerConcurrency ?? 1);
    this.workerPoolConfig = this.normalizeWorkerPoolConfig(
      this.config.workerPool
    );
  }

  private normalizeWorkerPoolConfig(
    pool?: WorkThreadPoolConfig
  ): WorkThreadPoolConfig | undefined {
    if (!pool) return undefined;
    if (!pool.entry) {
      throw new InternalError(
        "Worker pool configuration requires an explicit entry file path"
      );
    }
    if (pool.size != null && pool.size !== this.config.concurrency) {
      throw new InternalError(
        "TaskEngine concurrency must match workerPool.size when worker pool is enabled"
      );
    }
    return Object.assign({}, pool, {
      size: this.config.concurrency,
    });
  }

  private hasWorkerPool(): boolean {
    return !!this.workerPoolConfig && (this.workerPoolConfig.size ?? 0) > 0;
  }

  private getWorkerCount(): number {
    if (!this.workerPoolConfig) return 0;
    return this.workerPoolConfig.size ?? 0;
  }

  private getWorkerExecutionSlots(): number {
    return this.getWorkerCount() * this.workerThreadCapacity;
  }

  private canDispatchToWorkers(): boolean {
    return this.hasWorkerPool();
  }

  private getExecutionConcurrency(): number {
    if (this.hasWorkerPool()) {
      return Math.max(1, this.getWorkerExecutionSlots());
    }
    return this.config.concurrency;
  }

  private computeWorkerModules(): WorkThreadModulesConfig {
    const adapterDescriptor =
      this.config.workerAdapter ?? DefaultWorkThreadEnvironment.persistence;
    if (!adapterDescriptor?.adapterModule) {
      throw new InternalError(
        "Worker adapter descriptor must include adapterModule"
      );
    }
    const configuredImports =
      this.workerPoolConfig?.modules?.imports ??
      DefaultWorkThreadEnvironment.modules.imports;
    const imports: string[] = [];
    const append = (specifier?: string) => {
      if (!specifier) return;
      if (!imports.includes(specifier)) imports.push(specifier);
    };
    append(adapterDescriptor.adapterModule);
    for (const specifier of configuredImports) {
      if (specifier === adapterDescriptor.adapterModule) continue;
      append(specifier);
    }
    return { imports };
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

  private async ensureTaskError(
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
    if (this.running) {
      this.lock.release();
      return;
    }
    this.running = true;
    this.lock.release();
    await this.spawnWorkers();
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

    await new Promise<void>((resolve, reject) => {
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
    await this.shutdownWorkers();
  }

  // -------------------------
  // Worker pool orchestration
  // -------------------------

  private async spawnWorkers(): Promise<void> {
    if (!this.hasWorkerPool()) return;
    const target = this.getWorkerCount();
    const creations: Promise<void>[] = [];
    while (this.workerThreads.length < target) {
      const ready = this.createWorker();
      if (ready) creations.push(ready);
    }
    if (creations.length) {
      await Promise.all(creations);
    }
  }

  private createWorker(): Promise<void> | undefined {
    if (!this.workerPoolConfig) return undefined;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const entry = this.workerPoolConfig.entry;
    const workerId = `${this.config.workerId}-${this.workerCounter++}`;
    const env: WorkThreadEnvironmentShape = {
      workerId,
      mode: this.workerPoolConfig.mode ?? "node",
      persistence: Object.assign(
        {},
        this.config.workerAdapter ?? DefaultWorkThreadEnvironment.persistence,
        {
          alias: this.adapter.alias,
          flavour: this.adapter.flavour,
        }
      ),
      taskEngine: {
        concurrency: this.workerThreadCapacity,
        leaseMs: this.config.leaseMs,
        pollMsBusy: this.config.pollMsBusy,
        pollMsIdle: this.config.pollMsIdle,
        logTailMax: this.config.logTailMax,
        streamBufferSize: this.config.streamBufferSize,
        maxLoggingBuffer: this.config.maxLoggingBuffer,
        loggingBufferTruncation: this.config.loggingBufferTruncation,
        gracefulShutdownMsTimeout: this.config.gracefulShutdownMsTimeout,
      },
      modules: this.computeWorkerModules(),
    };
    const worker = new Worker(entry, {
      workerData: { environment: env },
    });
    const state: TaskWorkerThread = {
      id: workerId,
      worker,
      ready: false,
      activeJobs: 0,
      capacity: this.workerThreadCapacity,
      readyPromise,
      resolveReady,
      rejectReady,
    };
    this.workerThreads.push(state);
    worker.on("message", (msg: WorkerToMainMessage) =>
      this.handleWorkerMessage(state, msg)
    );
    worker.on("error", (err: Error) => this.handleWorkerError(state, err));
    worker.on("exit", (code) => this.handleWorkerExit(state, code));
    return readyPromise;
  }

  private async shutdownWorkers() {
    for (const state of this.workerThreads.splice(0)) {
      const message: MainToWorkerMessage = {
        type: "control",
        command: "shutdown",
      };
      try {
        state.worker.postMessage(message);
      } catch {
        // ignore
      }
      await state.worker.terminate();
    }
    for (const job of this.workerJobQueue.splice(0)) {
      job.reject(
        new InternalError(
          `Worker pool shutting down before job ${job.id} could start`
        )
      );
    }
    for (const job of this.workerJobs.values()) {
      job.reject(
        new InternalError(`Worker terminated before finishing job ${job.id}`)
      );
    }
    this.workerJobs.clear();
  }

  private handleWorkerError(state: TaskWorkerThread, err: Error) {
    this.log.error(`worker ${state.id} error: ${err.message}`, err);
    if (state.rejectReady) {
      state.rejectReady(err);
      state.resolveReady = undefined;
      state.rejectReady = undefined;
    }
  }

  private handleWorkerExit(state: TaskWorkerThread, code: number | null) {
    this.log.info(`worker ${state.id} exited with code ${code}`);
    if (state.rejectReady) {
      state.rejectReady(
        new Error(`worker ${state.id} exited before reporting ready`)
      );
      state.resolveReady = undefined;
      state.rejectReady = undefined;
    }
    const idx = this.workerThreads.indexOf(state);
    if (idx >= 0) this.workerThreads.splice(idx, 1);
    for (const [jobId, job] of this.workerJobs.entries()) {
      if (job.worker === state) {
        job.worker = undefined;
        this.workerJobs.delete(jobId);
        this.workerJobQueue.unshift(job);
      }
    }
    if (this.running) {
      void this.spawnWorkers().catch((err) =>
        this.log.error(`failed to respawn worker`, err)
      );
      this.processWorkerQueue();
    }
  }

  private handleWorkerMessage(
    state: TaskWorkerThread,
    msg: WorkerToMainMessage
  ) {
    if (msg.type === "ready") {
      state.ready = true;
      if (state.resolveReady) {
        state.resolveReady();
        state.resolveReady = undefined;
        state.rejectReady = undefined;
      }
      this.log.info(`worker ${state.id} ready`);
      this.processWorkerQueue();
      return;
    }
    if (msg.type === "error") {
      this.log.error(`worker ${state.id} reported error: ${msg.error}`);
      return;
    }
    if (msg.type === "log") {
      const job = this.workerJobs.get(msg.jobId);
      if (!job) return;
      void this.appendLog(job.ctx, job.task, msg.entries as WorkerLogEntry[])
        .then(([updated, entries]) => {
          job.task = updated;
          return this.emitLog(job.ctx, job.task.id, entries);
        })
        .catch((err) => this.log.error(`Failed to append worker log`, err));
      return;
    }
    if (msg.type === "progress") {
      const job = this.workerJobs.get(msg.jobId);
      if (!job) return;
      void this.emitProgress(job.ctx, job.task.id, msg.payload);
      return;
    }
    if (msg.type === "heartbeat") {
      const job = this.workerJobs.get(msg.jobId);
      if (!job) return;
      job.task.leaseExpiry = new Date(Date.now() + this.config.leaseMs);
      void this.tasks.update(job.task).catch(() => null);
      return;
    }
    if (msg.type === "result") {
      const job = this.workerJobs.get(msg.jobId);
      if (!job) return;
      this.workerJobs.delete(job.id);
      state.activeJobs = Math.max(0, state.activeJobs - 1);
      this.applyWorkerCache(job.ctx, msg.cache);
      switch (msg.status) {
        case "success":
          job.resolve(msg.output);
          break;
        case "error": {
          const err = new Error(msg.error.message);
          if (msg.error.name) err.name = msg.error.name;
          if (msg.error.stack) err.stack = msg.error.stack;
          job.reject(err);
          break;
        }
        case "state-change":
          job.reject(new TaskStateChangeError(msg.request));
          break;
      }
      this.processWorkerQueue();
      return;
    }
  }

  private applyWorkerCache(
    ctx: TaskContext,
    cache?: Record<string, any>
  ): void {
    if (!cache) return;
    Object.entries(cache).forEach(([key, value]) => {
      ctx.cacheResult(key, value);
    });
  }

  private processWorkerQueue() {
    if (!this.hasWorkerPool()) return;
    const available = this.workerThreads
      .filter((state) => state.ready && state.activeJobs < state.capacity)
      .sort((a, b) => a.activeJobs - b.activeJobs);
    for (const state of available) {
      while (
        state.activeJobs < state.capacity &&
        this.workerJobQueue.length > 0
      ) {
        const job = this.workerJobQueue.shift();
        if (!job) break;
        this.assignWorker(state, job);
      }
      if (!this.workerJobQueue.length) break;
    }
  }

  private assignWorker(state: TaskWorkerThread, job: WorkerJobState) {
    if (!this.workerPoolConfig) return;
    const payload: WorkerJobPayload = {
      jobId: job.id,
      taskId: job.task.id,
      classification: job.classification,
      input: job.input,
      attempt: job.task.attempt ?? 0,
      resultCache: job.ctx.resultCache ?? {},
      streamBufferSize: this.config.streamBufferSize,
      maxLoggingBuffer: this.config.maxLoggingBuffer,
      loggingBufferTruncation: this.config.loggingBufferTruncation,
    };
    job.worker = state;
    this.workerJobs.set(job.id, job);
    state.activeJobs += 1;
    const message: MainToWorkerMessage = {
      type: "execute",
      job: payload,
    };
    state.worker.postMessage(message);
  }

  private enqueueWorkerJob(job: WorkerJobState) {
    this.workerJobQueue.push(job);
    this.processWorkerQueue();
  }

  // -------------------------
  // Worker loop
  // -------------------------

  private async loop(...args: ContextualArgs<any>): Promise<void> {
    const { ctx } = this.logCtx(args, this.loop);
    while (await this.isRunning()) {
      const claimed = await this.claimBatch(ctx);
      await Promise.allSettled(claimed.map((t) => this.executeClaimed(t)));
      await sleep(
        claimed.length ? this.config.pollMsBusy : this.config.pollMsIdle
      );
    }
  }

  private async claimBatch(ctx: Context<any>): Promise<TaskModel[]> {
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
    const concurrency = this.getExecutionConcurrency();
    const candidates: TaskModel[] = await this.tasks
      .select()
      .where(runnable)
      .limit(Math.max(concurrency * 4, 20))
      .execute();

    log.verbose(`claimBatch candidates:${candidates.length}`);

    const out: TaskModel[] = [];
    for (const c of candidates) {
      const claimed = await this.tryClaim(c, ctx);
      if (claimed) out.push(claimed);
      if (out.length >= concurrency) break;
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

    let source: TaskModel = task;
    try {
      source = await this.tasks.read(task.id, ctx);
    } catch {
      // fallback to candidate payload
    }

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

  // -------------------------
  // Execution
  // -------------------------

  private async runHandlerInline(
    classification: string,
    input: any,
    ctx: TaskContext
  ): Promise<any> {
    const handler = this.registry.get(classification);
    if (!handler)
      throw new InternalError(
        `No task handler registered for type: ${classification}`
      );
    return handler.run(input, ctx);
  }

  private async dispatchToWorker(
    classification: string,
    input: any,
    task: TaskModel,
    ctx: TaskContext
  ): Promise<any> {
    if (!this.canDispatchToWorkers()) {
      return this.runHandlerInline(classification, input, ctx);
    }
    const uuid = await UUID.instance.generate();
    return new Promise((resolve, reject) => {
      const job: WorkerJobState = {
        id: uuid,
        classification,
        input,
        task,
        ctx,
        resolve,
        reject,
      };
      this.enqueueWorkerJob(job);
    });
  }

  private async invokeHandler(
    classification: string,
    input: any,
    task: TaskModel,
    ctx: TaskContext
  ): Promise<any> {
    if (!this.hasWorkerPool()) {
      return this.runHandlerInline(classification, input, ctx);
    }
    return this.dispatchToWorker(classification, input, task, ctx);
  }

  private async executeClaimed(task: TaskModel): Promise<void> {
    const { ctx, log } = (await this.logCtx([], task.classification, true)).for(
      this.executeClaimed
    );
    const taskCtx = TaskEngine.createTaskContext(ctx, {
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
        await taskCtx.logger.flush(taskCtx.pipe);
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
    });

    await this.emitStatus(taskCtx, task, TaskStatus.RUNNING);

    try {
      let output: any;
      if (task.atomicity === TaskType.COMPOSITE) {
        output = await this.runComposite(task, taskCtx);
        try {
          task = await this.tasks.read(task.id, taskCtx);
        } catch {
          // keep best-effort task state
        }
        if (output?.stepResults) {
          task.stepResults = output.stepResults;
          task.currentStep = output.stepResults.length;
        }
      } else {
        log.debug(`dispatching handler for ${task.id}`);
        output = await this.invokeHandler(
          task.classification,
          task.input,
          task,
          taskCtx
        );
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
      try {
        task = await this.tasks.read(task.id, taskCtx);
      } catch {
        // keep best-effort task state for retries/failures
      }
      if (err instanceof TaskStateChangeError) {
        await this.handleTaskStateChange(err.request, task, taskCtx);
        return;
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
        task = await this.tasks.update(task, taskCtx);
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

        task = await this.tasks.update(task, taskCtx);
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

  private async handleTaskStateChange(
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

  private async runComposite(
    task: TaskModel,
    context: TaskContext
  ): Promise<any> {
    const { ctx } = (
      await this.logCtx([context], task.classification, true)
    ).for(this.runComposite);
    const steps = this.normalizeSteps(task.steps);
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
      const step = steps[idx];

      await context.pipe([
        LogLevel.info,
        `Composite step ${idx + 1}/${steps.length}: ${step.classification}`,
      ]);

      try {
        const out = await this.invokeHandler(
          step.classification,
          step.input,
          task,
          context
        );

        const stepIndex = idx;
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

        task = await this.tasks.update(task);
        await this.emitProgress(context, task.id, {
          currentStep: idx,
          totalSteps: steps.length,
          output: out,
        });
      } catch (err: any) {
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
        task = await this.tasks.update(task);
        throw err;
      }
    }

    return { stepResults: results };
  }

  private normalizeBackoff(backoff: TaskBackoffModel | string | object | any) {
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

  private normalizeSteps(
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

  private normalizeStepResults(
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
