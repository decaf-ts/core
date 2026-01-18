/* eslint-disable @typescript-eslint/no-unused-vars */

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
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskEventType,
  TaskStatus,
  TaskType,
} from "../../src/tasks/constants";
import { Repo, Repository } from "../../src/repository";
import { sleep } from "../../src/tasks/utils";
import { Observer } from "../../src/index";
import { TaskEngineConfig } from "../../src/tasks/index";

jest.setTimeout(200000);

let adapter: RamAdapter;
let eventBus: TaskEventBus;
let registry: TaskHandlerRegistry;
let engine: TaskEngine<RamAdapter>;
let taskRepo: Repo<TaskModel>;
let unsubscribe: (() => void) | undefined;

const recordedEvents: TaskEventModel[] = [];
const uniqueId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createDates = () => {
  const timestamp = new Date();
  return { createdAt: timestamp, updatedAt: timestamp };
};
const createBackoff = () => new TaskBackoffModel(createDates());

const waitForTaskCompletion = async (id: string, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const task = await taskRepo.read(id);
    if (
      [TaskStatus.SUCCEEDED, TaskStatus.FAILED, TaskStatus.CANCELED].includes(
        task.status
      )
    ) {
      return task;
    }
    await sleep(25);
  }
  throw new Error(`Task ${id} did not finish within ${timeout}ms`);
};

const waitForTaskStatus = async (
  id: string,
  status: TaskStatus,
  timeout = 15000
) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const task = await taskRepo.read(id);
    if (task.status === status) return task;
    await sleep(25);
  }
  throw new Error(`Task ${id} did not reach ${status} within ${timeout}ms`);
};

const eventsFor = (taskId: string, type?: TaskEventType) =>
  recordedEvents.filter(
    (evt) => evt.taskId === taskId && (!type || evt.classification === type)
  );

const parseNumberInput = (input: unknown): number | undefined => {
  if (typeof input === "number") return input;
  if (typeof input === "string") {
    try {
      return parseNumberInput(JSON.parse(input));
    } catch {
      const asNumber = Number(input);
      return Number.isNaN(asNumber) ? undefined : asNumber;
    }
  }
  if (input && typeof input === "object") {
    const value = (input as { value?: unknown }).value;
    if (typeof value === "number") return value;
  }
  return undefined;
};

const parseObjectInput = <T extends object>(input: unknown): T | undefined => {
  if (input && typeof input === "object") return input as T;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parseObjectInput<T>(parsed);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

@task("simple-task")
class SimpleTask extends TaskHandler<number | { value: number }, number> {
  constructor() {
    super();
    console.log("SimpleTask instance created");
  }
  async run(value: number | { value: number }, ctx: TaskContext) {
    const input = parseNumberInput(value);
    if (typeof input !== "number") throw new Error("invalid simple-task input");
    console.log("SimpleTask run begin", value, ctx.taskId);
    ctx.logger.info(`doubling ${input}`);
    await sleep(20);
    ctx.logger.info(`simple task done`);
    console.log("SimpleTask flush start");
    await ctx.flush();
    console.log("SimpleTask flush done");
    console.log("SimpleTask run end", value, ctx.taskId);
    return input * 2;
  }
}

@task("progressive-task")
class ProgressiveTask extends TaskHandler<number | { value: number }, number> {
  static leaseSnapshots: Date[] = [];

  async run(value: number | { value: number }, ctx: TaskContext) {
    const input = parseNumberInput(value);
    if (typeof input !== "number")
      throw new Error("invalid progressive-task input");
    console.log("ProgressiveTask run begin", value, ctx.taskId);
    await ctx.progress({ percent: 0 });
    await sleep(20);
    await ctx.heartbeat();
    const snapshot = await taskRepo.read(ctx.taskId);
    if (snapshot.leaseExpiry) {
      ProgressiveTask.leaseSnapshots.push(snapshot.leaseExpiry);
    }
    await ctx.progress({ percent: 100 });
    await ctx.flush();
    return input + 1;
  }
}

@task("flaky-task")
class FlakyTask extends TaskHandler<number, number> {
  static attempts: Record<string, number> = {};

  async run(_: number, ctx: TaskContext) {
    console.log("FlakyTask run begin", ctx.taskId, ctx.attempt);
    const attempt = (FlakyTask.attempts[ctx.taskId] ?? 0) + 1;
    FlakyTask.attempts[ctx.taskId] = attempt;
    await ctx.progress({ attempt });
    if (attempt === 1) {
      ctx.logger.warn(`intentional fail #${attempt}`);
      await ctx.flush();
      throw new Error("transient failure");
    }
    ctx.logger.verbose(`success at attempt #${attempt}`);
    await ctx.flush();
    console.log("FlakyTask run end", ctx.taskId, attempt);
    return attempt;
  }
}

@task("step-one-task")
class StepOneTask extends TaskHandler<number | { value: number }, number> {
  async run(input: number | { value: number }, ctx: TaskContext) {
    const value = parseNumberInput(input);
    if (typeof value !== "number")
      throw new Error("invalid step-one-task input");
    const result = value + 5;
    ctx.cacheResult("step-one-task", result);
    await ctx.flush();
    return result;
  }
}

@task("step-two-task")
class StepTwoTask extends TaskHandler<void, number> {
  async run(_: void, ctx: TaskContext) {
    const cache = ctx.resultCache ?? {};
    const previous = cache["step-one-task"];
    if (typeof previous !== "number")
      throw new Error("previous step result missing");
    const result = previous * 2;
    ctx.cacheResult("step-two-task", result);
    await ctx.flush();
    return result;
  }
}

@task("step-three-task")
class StepThreeTask extends TaskHandler<void, number> {
  async run(_: void, ctx: TaskContext) {
    const cache = ctx.resultCache ?? {};
    const first = cache["step-one-task"];
    const second = cache["step-two-task"];
    if (typeof first !== "number" || typeof second !== "number")
      throw new Error("previous results unavailable");
    await ctx.flush();
    return first + second;
  }
}

@task("flaky-step-task")
class FlakyStepTask extends TaskHandler<{ offset?: number }, number> {
  static attempts: Record<string, number> = {};

  async run(input: { offset?: number } | undefined, ctx: TaskContext) {
    const payload = parseObjectInput<{ offset?: number }>(input) ?? input;
    const attempt = (FlakyStepTask.attempts[ctx.taskId] ?? 0) + 1;
    FlakyStepTask.attempts[ctx.taskId] = attempt;
    await ctx.progress({ attempt });
    if (attempt === 1) {
      ctx.logger.warn(`flaky composite step failing on attempt ${attempt}`);
      await ctx.flush();
      throw new Error("flaky step failure");
    }
    const cache = ctx.resultCache ?? {};
    const previous = cache["step-one-task"];
    if (typeof previous !== "number")
      throw new Error("previous step result missing");
    const delta = payload?.offset ?? 0;
    const result = previous + delta;
    ctx.cacheResult("flaky-step-task", result);
    await ctx.flush();
    return result;
  }
}

@task("combine-step-task")
class CombineStepTask extends TaskHandler<void, number> {
  async run(_: void, ctx: TaskContext) {
    const cache = ctx.resultCache ?? {};
    const first = cache["step-one-task"];
    const flaky = cache["flaky-step-task"];
    if (typeof first !== "number" || typeof flaky !== "number")
      throw new Error("required step results missing");
    await ctx.flush();
    return first + flaky;
  }
}

describe("Task Engine", () => {
  beforeAll(async () => {
    adapter = new RamAdapter();
    eventBus = new TaskEventBus();
    registry = new TaskHandlerRegistry();
    taskRepo = Repository.forModel(TaskModel, adapter.alias);
    const config: TaskEngineConfig<RamAdapter> = {
      adapter,
      bus: eventBus,
      registry,
      workerId: "integration-worker",
      concurrency: 1,
      leaseMs: 500,
      pollMsIdle: 1000,
      pollMsBusy: 500,
      logTailMax: 200,
      streamBufferSize: 5,
      maxLoggingBuffer: 500,
      loggingBufferTruncation: 50,
    };
    engine = new TaskEngine(config);
    engine.start();
    unsubscribe = eventBus.observe({
      refresh: async (payload) => {
        recordedEvents.push(payload as TaskEventModel);
      },
    } as Observer);
  });

  beforeEach(() => {
    recordedEvents.length = 0;
    FlakyTask.attempts = {};
    FlakyStepTask.attempts = {};
    ProgressiveTask.leaseSnapshots = [];
  });

  afterAll(() => {
    engine?.stop();
    if (unsubscribe) unsubscribe();
  });

  it("executes atomic tasks, persists logs, and emits status events", async () => {
    const dates = createDates();
    const toSubmit = new TaskBuilder({
      classification: "simple-task",
      input: { value: 7 },
      maxAttempts: 2,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    const logMock = jest.fn();
    const { task, tracker } = await engine.push(toSubmit, true);
    tracker.logs(async (logs) => logMock(logs));
    const finished = await tracker.resolve();
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(14);

    const persisted = await taskRepo.read(task.id);
    expect(persisted.status).toBe(TaskStatus.SUCCEEDED);
    expect(persisted.output).toBe(14);

    const statusEvents = eventsFor(task.id, TaskEventType.STATUS);
    const statusValues = statusEvents.map((evt) => evt.payload?.status);
    expect(statusValues).toEqual(
      expect.arrayContaining([TaskStatus.RUNNING, TaskStatus.SUCCEEDED])
    );

    const logEvents = eventsFor(task.id, TaskEventType.LOG);
    expect(logEvents.length).toBeGreaterThan(0);
    expect(logMock).toHaveBeenCalled();
    expect(persisted.logTail?.length ?? 0).toBeGreaterThan(0);
  });

  it("emits progress events and extends leases on heartbeat", async () => {
    const dates = createDates();
    const toSubmit = new TaskBuilder({
      classification: "progressive-task",
      input: { value: 3 },
      maxAttempts: 1,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    const { task, tracker } = await engine.push(toSubmit, true);

    const running = await waitForTaskStatus(task.id, TaskStatus.RUNNING);
    const initialLease = running.leaseExpiry?.getTime() ?? 0;

    const finished = await tracker.resolve();
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(4);

    const progressEvents = eventsFor(task.id, TaskEventType.PROGRESS);
    expect(progressEvents.length).toBe(2);
    expect(progressEvents[0].payload).toMatchObject({ percent: 0 });
    expect(progressEvents[1].payload).toMatchObject({ percent: 100 });

    expect(ProgressiveTask.leaseSnapshots.length).toBe(1);
    const snapshot = ProgressiveTask.leaseSnapshots[0];
    expect(snapshot instanceof Date).toBe(true);
    expect(snapshot.getTime()).toBeGreaterThanOrEqual(initialLease);
  });

  it("retries flaky tasks with backoff and persists errors/logs", async () => {
    const dates = createDates();
    const backoff = new TaskBackoffModel({
      ...createDates(),
      baseMs: 10,
      maxMs: 10,
      strategy: BackoffStrategy.FIXED,
      jitter: JitterStrategy.NONE,
    });
    const toSubmit = new TaskBuilder({
      classification: "flaky-task",
      input: { value: 0 },
      maxAttempts: 2,
      attempt: 0,
      ...dates,
      backoff,
    }).build();
    const { task, tracker } = await engine.push(toSubmit, true);

    const waiting = await waitForTaskStatus(task.id, TaskStatus.WAITING_RETRY);
    expect(waiting.attempt).toBe(1);
    expect(waiting.error?.message).toBe("transient failure");
    expect(waiting.nextRunAt).toBeInstanceOf(Date);

    const finished = await tracker.resolve();
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(2);
    expect(FlakyTask.attempts[task.id]).toBe(2);

    const persisted = await taskRepo.read(task.id);
    expect(persisted.logTail?.length ?? 0).toBeGreaterThan(0);

    const logEvents = eventsFor(task.id, TaskEventType.LOG);
    const messages = logEvents.flatMap((evt) => {
      let logs: unknown = evt.payload;
      if (typeof logs === "string") {
        try {
          logs = JSON.parse(logs);
        } catch {
          return [];
        }
      }
      if (!Array.isArray(logs)) return [];
      return logs
        .map((entry) => {
          if (Array.isArray(entry)) return entry[1];
          if (entry && typeof entry === "object" && "msg" in entry)
            return (entry as { msg?: string }).msg;
          return undefined;
        })
        .filter((msg): msg is string => typeof msg === "string");
    });
    expect(messages.some((msg) => msg.includes("intentional fail"))).toBe(true);
    expect(messages.some((msg) => msg.includes("success at attempt"))).toBe(
      true
    );

    const statusEvents = eventsFor(task.id, TaskEventType.STATUS);
    const statuses = statusEvents.map((evt) => evt.payload?.status);
    expect(statuses).toEqual(
      expect.arrayContaining([TaskStatus.WAITING_RETRY, TaskStatus.SUCCEEDED])
    );
  });

  it("executes composite tasks, caches step results, and retries failed steps", async () => {
    const dates = createDates();
    const composite = new CompositeTaskBuilder({
      classification: "composite-test",
      atomicity: TaskType.COMPOSITE,
      attempt: 0,
      maxAttempts: 2,
      ...dates,
      backoff: createBackoff(),
    })
      .addStep("step-one-task", { value: 5 })
      .addStep("flaky-step-task", { offset: 3 })
      .addStep("combine-step-task")
      .build();
    expect(composite.steps?.length).toBe(3);

    const { task, tracker } = await engine.push(composite, true);
    const snapshot = await taskRepo.read(task.id);
    expect(snapshot.steps?.length).toBe(3);

    const waiting = await waitForTaskStatus(task.id, TaskStatus.WAITING_RETRY);
    expect(waiting.status).toBe(TaskStatus.WAITING_RETRY);

    const finished = await tracker.resolve();
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);

    const persisted = await taskRepo.read(task.id);
    const outputResultsRaw =
      (finished.output as any)?.stepResults ??
      (persisted.output as any)?.stepResults;
    let outputResults: any[] = [];
    if (Array.isArray(outputResultsRaw)) {
      outputResults = outputResultsRaw;
    } else if (typeof outputResultsRaw === "string") {
      try {
        const parsed = JSON.parse(outputResultsRaw);
        outputResults = Array.isArray(parsed) ? parsed : [];
      } catch {
        outputResults = [];
      }
    }
    const finalResults =
      (persisted.stepResults?.length ?? 0) > 0
        ? persisted.stepResults
        : outputResults;
    expect(finalResults?.length).toBe(3);
    expect(finalResults?.every((step) => step.status === TaskStatus.SUCCEEDED)).toBe(
      true
    );
    expect(finalResults?.[0]?.output).toBe(10);
    expect(finalResults?.[1]?.output).toBe(13);
    expect(finalResults?.[2]?.output).toBe(23);

    const progressEvents = eventsFor(task.id, TaskEventType.PROGRESS);
    expect(progressEvents.length).toBeGreaterThanOrEqual(3);
    const lastProgress = progressEvents[progressEvents.length - 1];
    expect(lastProgress.payload).toMatchObject({
      currentStep: 3,
      totalSteps: 3,
    });
  });

  it("cancels pending tasks and emits cancellation events", async () => {
    engine.stop();
    const dates = createDates();
    const toSubmit = new TaskBuilder({
      classification: "simple-task",
      input: { value: 11 },
      maxAttempts: 1,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    const task = await engine.push(toSubmit);

    const canceled = await engine.cancel(task.id);
    expect(canceled.status).toBe(TaskStatus.CANCELED);

    const statusEvents = eventsFor(task.id, TaskEventType.STATUS);
    const statuses = statusEvents.map((evt) => evt.payload?.status);
    expect(statuses).toContain(TaskStatus.CANCELED);

    engine.start();
  });

  it("rejects tracker promise on failed task", async () => {
    const dates = createDates();
    const toSubmit = new TaskBuilder({
      classification: "flaky-task",
      input: { value: 0 },
      maxAttempts: 1,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    const { tracker } = await engine.push(toSubmit, true);
    await expect(tracker.resolve()).rejects.toMatchObject({
      status: TaskStatus.FAILED,
    });
  });
});
