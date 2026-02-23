import { Worker } from "worker_threads";
import { Adapter } from "../persistence/Adapter";
import { ContextOf } from "../persistence/types";
import { LogLevel } from "@decaf-ts/logging";
import { MaybeContextualArg } from "../utils/ContextualLoggedClass";
import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { PersistenceKeys, UUID } from "../persistence/index";

import {
  WorkThreadEnvironmentShape,
  DefaultWorkThreadEnvironment,
  WorkThreadModulesConfig,
} from "./WorkThreadEnvironment";
import {
  MainToWorkerMessage,
  WorkerJobPayload,
  WorkerLogEntry,
  WorkerToMainMessage,
} from "./messages";
import { TaskModel } from "../tasks/models/TaskModel";
import {
  TaskContext,
  TaskEngine as TE,
  DefaultTaskEngineConfig,
  TaskEventBus,
  TaskHandlerRegistry,
  TaskStatus,
  TaskLogger,
  TaskType,
  serializeError,
  computeBackoffMs,
} from "../tasks";
import {
  TaskEngineConfig,
  TaskWorkerThread,
  WorkerJobState,
  WorkThreadPoolConfig,
} from "./types";
import { TaskStateChangeError } from "../tasks/TaskStateChangeError";

export class TaskEngine<A extends Adapter<any, any, any, any>> extends TE<
  A,
  TaskEngineConfig<A>
> {
  protected workerPoolConfig?: WorkThreadPoolConfig;
  protected workerThreads: TaskWorkerThread[] = [];
  protected workerJobQueue: WorkerJobState[] = [];
  protected workerJobs = new Map<string, WorkerJobState>();
  protected workerCounter = 0;
  protected workerThreadCapacity = 1;

  protected override get Context(): Constructor<ContextOf<A>> {
    return TaskContext as unknown as Constructor<ContextOf<A>>;
  }

  constructor(config: TaskEngineConfig<A>) {
    super(config);
    if (config.workerPool && !config.workerAdapter) {
      throw new InternalError(
        "Worker pool requires workerAdapter descriptor in TaskEngineConfig"
      );
    }
    this.config = Object.assign(
      {
        workerConcurrency: 1,
      },
      DefaultTaskEngineConfig,
      config,
      {
        bus: config.bus || new TaskEventBus(),
        registry: config.registry || new TaskHandlerRegistry(),
      }
    );
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

  override async start(...args: MaybeContextualArg<any>): Promise<void> {
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

  override async stop(...args: MaybeContextualArg<any>): Promise<void> {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.SHUTDOWN, true)
    ).for(this.stop);
    await super.stop(...ctxArgs);
    await this.shutdownWorkers();
  }

  // -------------------------
  // Worker pool orchestration
  // -------------------------

  protected async spawnWorkers(): Promise<void> {
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

  protected createWorker(): Promise<void> | undefined {
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
  // Execution
  // -------------------------

  protected async runHandlerInline(
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

  protected override async executeClaimed(task: TaskModel): Promise<void> {
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
}
