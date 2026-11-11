import "../../src/index";
import "../../src/overrides/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { task } from "../../src/tasks/decorators";
import { CompositeTaskBuilder, TaskBuilder } from "../../src/tasks/builder";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskStepSpecModel } from "../../src/tasks/models/TaskStepSpecModel";
import { TaskStepResultModel } from "../../src/tasks/models/TaskStepResultModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskEventType,
  TaskStatus,
  TaskType,
} from "../../src/tasks/constants";
import { Repo, Repository } from "../../src/repository";
import { Condition, Observer, TaskService } from "../../src/index";
import { TaskEngineConfig } from "../../src/tasks/index";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@decaf-ts/db-decorators";

jest.setTimeout(30000);

let adapter: RamAdapter;
let bus: TaskEventBus;
let engine: TaskEngine<RamAdapter>;
let taskService: TaskService<RamAdapter>;
let taskRepo: Repo<TaskModel>;
let eventRepo: Repo<TaskEventModel>;
let unsubscribe: (() => void) | undefined;
const recorded: TaskEventModel[] = [];

// runs per `${taskId}:${step}`; failures toggled per task id
const runs: Record<string, number> = {};
const failing = new Set<string>();
const tolerated = new Set<string>();

const count = (ctx: TaskContext) => {
  const key = `${ctx.taskId}:${ctx.step ?? "atomic"}`;
  runs[key] = (runs[key] ?? 0) + 1;
};
const runsOf = (id: string, step: number | "atomic") =>
  runs[`${id}:${step}`] ?? 0;

@task("retry-count-step")
class RetryCountStep extends TaskHandler<any, number> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    return 7 + (ctx.step ?? 0);
  }
}

@task("retry-gate-step")
class RetryGateStep extends TaskHandler<any, number> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    if (failing.has(ctx.taskId)) throw new Error("gate closed");
    return 100;
  }
}

@task("retry-tolerated-step")
class RetryToleratedStep extends TaskHandler<any, string> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    if (tolerated.has(ctx.taskId)) throw new Error("tolerated failure");
    return "tolerated-ok";
  }
}

// sums step 0's output (read from the per-step cache) and the gate output
@task("retry-sum-step")
class RetrySumStep extends TaskHandler<any, number> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    const cache = ctx.resultCache ?? {};
    const first = cache[`${ctx.taskId}:step:0`];
    const gate = cache["retry-gate-step"];
    if (typeof first !== "number" || typeof gate !== "number")
      throw new Error("retry-sum-step: missing cached results");
    return first + gate;
  }
}

@task("retry-atomic")
class RetryAtomic extends TaskHandler<any, string> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    if (failing.has(ctx.taskId)) throw new Error("atomic gate closed");
    return "ok";
  }
}

// fails on its first run only
@task("retry-flaky-once")
class RetryFlakyOnce extends TaskHandler<any, string> {
  async run(_: any, ctx: TaskContext) {
    count(ctx);
    if (runsOf(ctx.taskId, "atomic") === 1) throw new Error("first run fails");
    return "recovered";
  }
}

// keep the decorated handlers referenced
expect([
  RetryFlakyOnce,
  RetryCountStep,
  RetryGateStep,
  RetryToleratedStep,
  RetrySumStep,
  RetryAtomic,
]).toBeDefined();

const backoff = () =>
  new TaskBackoffModel({
    baseMs: 10,
    maxMs: 20,
    strategy: BackoffStrategy.FIXED,
    jitter: JitterStrategy.NONE,
  });

const step = (classification: string, extra: Partial<TaskStepSpecModel> = {}) =>
  new TaskStepSpecModel({ classification, input: {}, ...extra });

const compositeOf = (steps: TaskStepSpecModel[], maxAttempts = 1) =>
  new CompositeTaskBuilder({
    classification: "retry-composite",
    atomicity: TaskType.COMPOSITE,
    maxAttempts,
    backoff: backoff(),
  })
    .setSteps(steps)
    .build();

const defaultSteps = () => [
  step("retry-count-step"),
  step("retry-gate-step"),
  step("retry-sum-step"),
];

// pushes a task, gates its failure-prone handlers, and waits for FAILED
const failedTask = async (
  pending: TaskModel,
  opts: { tolerate?: boolean; keepFailing?: boolean } = {}
) => {
  const { task: created, tracker } = await engine.push(pending, true);
  failing.add(created.id);
  if (opts.tolerate) tolerated.add(created.id);
  await expect(tracker.resolve()).rejects.toBeDefined();
  if (!opts.keepFailing) failing.delete(created.id);
  tolerated.delete(created.id);
  const failed = await taskRepo.read(created.id);
  expect(failed.status).toBe(TaskStatus.FAILED);
  return failed;
};

const finish = async (id: string) => {
  const { tracker } = await engine.track(id);
  return tracker.wait();
};

const outputs = (t: TaskModel) =>
  (t.stepResults ?? []).map((r: TaskStepResultModel) => r.output);

describe("TaskEngine.retry", () => {
  beforeAll(async () => {
    adapter = new RamAdapter();
    bus = new TaskEventBus();
    taskRepo = Repository.forModel(TaskModel, adapter.alias);
    eventRepo = Repository.forModel(TaskEventModel, adapter.alias);
    const config: TaskEngineConfig<RamAdapter> = {
      adapter,
      bus,
      registry: new TaskHandlerRegistry(),
      workerId: "retry-test-worker",
      concurrency: 5,
      leaseMs: 500,
      pollMsIdle: 30,
      pollMsBusy: 15,
      logTailMax: 1000,
      streamBufferSize: 5,
      maxLoggingBuffer: 500,
      loggingBufferTruncation: 50,
      gracefulShutdownMsTimeout: 2000,
    };
    taskService = new TaskService();
    await taskService.boot(config);
    engine = taskService.client;
    await engine.start();
    unsubscribe = bus.observe({
      refresh: async (evt: TaskEventModel) => {
        recorded.push(evt);
      },
    } as Observer);
  });

  afterAll(async () => {
    if (unsubscribe) unsubscribe();
    await engine?.stop();
  });

  describe("composite tasks", () => {
    it("resumes from the failed step by default, rehydrating earlier results", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      expect(failed.currentStep).toBe(1);
      expect(failed.error?.message).toContain("gate closed");
      expect(runsOf(failed.id, 0)).toBe(1);
      expect(runsOf(failed.id, 1)).toBe(1);
      expect(runsOf(failed.id, 2)).toBe(0);

      const requeued = await engine.retry(failed.id);
      expect(requeued.status).toBe(TaskStatus.PENDING);
      expect(requeued.attempt).toBe(0);
      expect(requeued.error).toBeUndefined();
      expect(requeued.currentStep).toBe(1);
      expect(outputs(requeued)).toEqual([7]);

      // the persisted record matches what retry returned (cleared fields stick)
      const persisted = await taskRepo.read(failed.id);
      expect(persisted.error).toBeUndefined();
      expect(persisted.leaseOwner).toBeUndefined();

      const result = await finish(failed.id);
      expect(result.stepResults.map((r: any) => r.output)).toEqual([
        7, 100, 107,
      ]);
      expect(runsOf(failed.id, 0)).toBe(1); // not re-run, read from cache
      expect(runsOf(failed.id, 1)).toBe(2);
      expect(runsOf(failed.id, 2)).toBe(1);

      const done = await taskRepo.read(failed.id);
      expect(done.status).toBe(TaskStatus.SUCCEEDED);
      expect(done.error).toBeUndefined();
      expect(done.currentStep).toBe(3);
    });

    it("resumes from an earlier step by index, discarding later results", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      const requeued = await engine.retry(failed.id, { fromStep: 0 });
      expect(requeued.currentStep).toBe(0);
      expect(outputs(requeued)).toEqual([]);

      const result = await finish(failed.id);
      expect(result.stepResults.map((r: any) => r.output)).toEqual([
        7, 100, 107,
      ]);
      expect(runsOf(failed.id, 0)).toBe(2);
      expect(runsOf(failed.id, 1)).toBe(2);
      expect(runsOf(failed.id, 2)).toBe(1);
    });

    it("resolves fromStep by classification and by step name", async () => {
      const byClassification = await failedTask(compositeOf(defaultSteps()));
      const a = await engine.retry(byClassification.id, {
        fromStep: "retry-gate-step",
      });
      expect(a.currentStep).toBe(1);
      await finish(byClassification.id);
      expect(runsOf(byClassification.id, 0)).toBe(1);

      // two steps sharing a classification: only the name disambiguates
      const named = await failedTask(
        compositeOf([
          step("retry-count-step", { name: "first" }),
          step("retry-count-step", { name: "second" }),
          step("retry-gate-step", { name: "gate" }),
          step("retry-sum-step", { name: "sum" }),
        ])
      );
      expect(named.currentStep).toBe(2);
      const b = await engine.retry(named.id, { fromStep: "second" });
      expect(b.currentStep).toBe(1);
      expect(outputs(b)).toEqual([7]);
      const result = await finish(named.id);
      expect(result.stepResults.map((r: any) => r.output)).toEqual([
        7, 8, 100, 107,
      ]);
      expect(runsOf(named.id, 0)).toBe(1);
      expect(runsOf(named.id, 1)).toBe(2);
    });

    it("skips past tolerated failures by default and can re-run them on request", async () => {
      const steps = () => [
        step("retry-count-step"),
        step("retry-tolerated-step", { canFail: true }),
        step("retry-gate-step"),
        step("retry-sum-step"),
      ];

      const skip = await failedTask(compositeOf(steps()), { tolerate: true });
      expect(skip.currentStep).toBe(2);
      expect(skip.stepResults?.[1]?.status).toBe(TaskStatus.FAILED);
      const a = await engine.retry(skip.id);
      expect(a.currentStep).toBe(2);
      await finish(skip.id);
      const skipped = await taskRepo.read(skip.id);
      expect(skipped.status).toBe(TaskStatus.SUCCEEDED);
      // the tolerated failure is kept as-is and not re-run
      expect(skipped.stepResults?.[1]?.status).toBe(TaskStatus.FAILED);
      expect(runsOf(skip.id, 1)).toBe(1);

      const rerun = await failedTask(compositeOf(steps()), { tolerate: true });
      const b = await engine.retry(rerun.id, { fromStep: 1 });
      expect(b.currentStep).toBe(1);
      await finish(rerun.id);
      const rerunDone = await taskRepo.read(rerun.id);
      expect(rerunDone.stepResults?.[1]?.status).toBe(TaskStatus.SUCCEEDED);
      expect(rerunDone.stepResults?.[1]?.output).toBe("tolerated-ok");
      expect(runsOf(rerun.id, 1)).toBe(2);
    });

    it("re-runs every step from the failed one onward, even ones that succeeded in a concurrent batch", async () => {
      const concurrent = (classification: string) =>
        step(classification, { allowConcurrent: true, lock: "retry-batch" });
      const failed = await failedTask(
        compositeOf([
          concurrent("retry-count-step"),
          concurrent("retry-gate-step"),
          concurrent("retry-count-step"),
        ])
      );
      expect(failed.stepResults?.[0]?.status).toBe(TaskStatus.SUCCEEDED);
      expect(failed.stepResults?.[1]?.status).toBe(TaskStatus.FAILED);
      expect(failed.stepResults?.[2]?.status).toBe(TaskStatus.SUCCEEDED);

      const requeued = await engine.retry(failed.id);
      expect(requeued.currentStep).toBe(1);
      expect(outputs(requeued)).toEqual([7]);
      const result = await finish(failed.id);
      expect(result.stepResults.map((r: any) => r.output)).toEqual([7, 100, 9]);
      expect(runsOf(failed.id, 0)).toBe(1);
      expect(runsOf(failed.id, 1)).toBe(2);
      expect(runsOf(failed.id, 2)).toBe(2);
    });

    it("finalizes a canceled task whose steps all concluded without re-running any", async () => {
      const now = new Date();
      const result = (output: number) =>
        new TaskStepResultModel({
          status: TaskStatus.SUCCEEDED,
          output,
          attempt: 1,
          createdAt: now,
          updatedAt: now,
        });
      const created = await taskRepo.create(
        new TaskModel({
          ...compositeOf([step("retry-count-step"), step("retry-count-step")]),
          status: TaskStatus.CANCELED,
          stepResults: [result(7), result(8)],
          currentStep: 2,
        })
      );
      const requeued = await engine.retry(created.id);
      expect(requeued.currentStep).toBe(2);
      expect(outputs(requeued)).toEqual([7, 8]);
      await finish(created.id);
      const done = await taskRepo.read(created.id);
      expect(done.status).toBe(TaskStatus.SUCCEEDED);
      expect(outputs(done)).toEqual([7, 8]);
      expect(runsOf(created.id, 0)).toBe(0);
      expect(runsOf(created.id, 1)).toBe(0);
    });

    it("rejects fromStep values that are unknown, out of range, malformed or past the failed step", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      for (const fromStep of [2, 3, 9, -1, 1.5, "missing-step", ""]) {
        await expect(engine.retry(failed.id, { fromStep })).rejects.toThrow(
          BadRequestError
        );
      }
      // nothing was changed by the rejected calls
      const untouched = await taskRepo.read(failed.id);
      expect(untouched.status).toBe(TaskStatus.FAILED);
      expect(untouched.error).toBeDefined();
      expect(untouched.stepResults?.length).toBe(2);
    });
  });

  describe("attempt budget", () => {
    it("restores the full maxAttempts budget by default", async () => {
      const failed = await failedTask(compositeOf(defaultSteps(), 2), {
        keepFailing: true,
      });
      expect(failed.attempt).toBe(2);
      expect(runsOf(failed.id, 1)).toBe(2);

      await engine.retry(failed.id);
      const { tracker } = await engine.track(failed.id);
      await expect(tracker.wait()).rejects.toBeDefined();
      const again = await taskRepo.read(failed.id);
      expect(again.status).toBe(TaskStatus.FAILED);
      expect(again.attempt).toBe(2);
      expect(runsOf(failed.id, 1)).toBe(4); // two more automatic attempts
      failing.delete(failed.id);
    });

    it("keeps the exhausted counter with resetAttempts: false (single extra attempt)", async () => {
      const failed = await failedTask(compositeOf(defaultSteps(), 2), {
        keepFailing: true,
      });
      const requeued = await engine.retry(failed.id, { resetAttempts: false });
      expect(requeued.attempt).toBe(2);
      const { tracker } = await engine.track(failed.id);
      await expect(tracker.wait()).rejects.toBeDefined();
      const again = await taskRepo.read(failed.id);
      expect(again.status).toBe(TaskStatus.FAILED);
      expect(again.attempt).toBe(3);
      expect(runsOf(failed.id, 1)).toBe(3);
      failing.delete(failed.id);
    });
  });

  describe("scheduling and events", () => {
    it("schedules the retry when scheduledTo is given", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      const when = new Date(Date.now() + 300);
      const requeued = await engine.retry(failed.id, { scheduledTo: when });
      expect(requeued.status).toBe(TaskStatus.SCHEDULED);
      expect(new Date(requeued.scheduledTo as Date).getTime()).toBe(
        when.getTime()
      );
      await finish(failed.id);
      expect(Date.now()).toBeGreaterThanOrEqual(when.getTime());
      expect((await taskRepo.read(failed.id)).status).toBe(
        TaskStatus.SUCCEEDED
      );
    });

    it("emits and persists a status event for the re-queued state", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      recorded.length = 0;
      await engine.retry(failed.id);
      const statusOf = (evt: TaskEventModel) =>
        (typeof evt.payload === "string"
          ? JSON.parse(evt.payload)
          : evt.payload
        )?.status;
      const emitted = recorded.filter(
        (evt) =>
          evt.taskId === failed.id &&
          evt.classification === TaskEventType.STATUS
      );
      expect(emitted.map(statusOf)[0]).toBe(TaskStatus.PENDING);

      const persisted = await eventRepo
        .select()
        .where(Condition.attribute<TaskEventModel>("taskId").eq(failed.id))
        .execute();
      expect(
        persisted
          .filter((evt) => evt.classification === TaskEventType.STATUS)
          .map(statusOf)
      ).toContain(TaskStatus.PENDING);
      await finish(failed.id);
    });
  });

  describe("status guards", () => {
    it("only accepts FAILED or CANCELED tasks", async () => {
      const succeeded = await engine.push(
        new TaskBuilder({
          classification: "retry-atomic",
          maxAttempts: 1,
          backoff: backoff(),
        }).build(),
        true
      );
      await succeeded.tracker.resolve();
      await expect(engine.retry(succeeded.task.id)).rejects.toThrow(
        ConflictError
      );

      const scheduled = await engine
        .schedule(
          new TaskBuilder({
            classification: "retry-atomic",
            maxAttempts: 1,
            backoff: backoff(),
          }).build()
        )
        .for(new Date(Date.now() + 60_000));
      await expect(engine.retry(scheduled.id)).rejects.toThrow(ConflictError);

      for (const status of [
        TaskStatus.PENDING,
        TaskStatus.RUNNING,
        TaskStatus.WAITING_RETRY,
      ]) {
        const created = await taskRepo.create(
          new TaskModel({
            classification: "retry-atomic",
            maxAttempts: 1,
            backoff: backoff(),
            status,
            // keep the engine from claiming it while we assert
            leaseExpiry: new Date(Date.now() + 60_000),
            nextRunAt: new Date(Date.now() + 60_000),
          })
        );
        await expect(engine.retry(created.id)).rejects.toThrow(ConflictError);
        if (status === TaskStatus.PENDING) await finish(created.id);
      }

      // canceled tasks can be retried
      await engine.cancel(scheduled.id);
      await engine.retry(scheduled.id);
      await finish(scheduled.id);
      expect((await taskRepo.read(scheduled.id)).status).toBe(
        TaskStatus.SUCCEEDED
      );
    });

    it("throws NotFoundError for unknown tasks", async () => {
      await expect(engine.retry("does-not-exist")).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe("atomic tasks", () => {
    it("re-runs a failed atomic task and rejects fromStep for it", async () => {
      const failed = await failedTask(
        new TaskBuilder({
          classification: "retry-atomic",
          maxAttempts: 1,
          backoff: backoff(),
        }).build()
      );
      await expect(engine.retry(failed.id, { fromStep: 0 })).rejects.toThrow(
        BadRequestError
      );
      const requeued = await engine.retry(failed.id);
      expect(requeued.status).toBe(TaskStatus.PENDING);
      expect(requeued.error).toBeUndefined();
      expect(await finish(failed.id)).toBe("ok");
      expect(runsOf(failed.id, "atomic")).toBe(2);
    });
  });

  describe("success after a failed attempt", () => {
    it("clears the previous attempt's error and lease from the succeeded record", async () => {
      const { task: created, tracker } = await engine.push(
        new TaskBuilder({
          classification: "retry-flaky-once",
          maxAttempts: 2,
          backoff: backoff(),
        }).build(),
        true
      );
      expect(await tracker.wait()).toBe("recovered");
      const done = await taskRepo.read(created.id);
      expect(done.status).toBe(TaskStatus.SUCCEEDED);
      expect(done.attempt).toBe(1);
      expect(done.output).toBe("recovered");
      expect(done.error).toBeUndefined();
      expect(done.leaseOwner).toBeUndefined();
      expect(done.leaseExpiry).toBeUndefined();
    });
  });

  describe("TaskService.retry", () => {
    it("delegates to the engine and starts it when stopped", async () => {
      const failed = await failedTask(compositeOf(defaultSteps()));
      await engine.stop();
      expect(await engine.isRunning()).toBe(false);

      const requeued = await taskService.retry(failed.id, {
        fromStep: "retry-gate-step",
      });
      expect(requeued.currentStep).toBe(1);
      // start() is fire-and-forget: completion proves the engine was started
      await finish(failed.id);
      expect(await engine.isRunning()).toBe(true);
      expect((await taskRepo.read(failed.id)).status).toBe(
        TaskStatus.SUCCEEDED
      );
      expect(runsOf(failed.id, 0)).toBe(1);
    });
  });
});
