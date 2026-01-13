import "../../src/index";
import "../../src/overrides/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine, TaskEngineConfig } from "../../src/tasks/TaskEngine";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { task } from "../../src/tasks/decorators";
import { TaskBuilder, CompositeTaskBuilder } from "../../src/tasks/builder";
import { TaskStepSpecModel } from "../../src/tasks/models/TaskStepSpecModel";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskStatus, TaskType, TaskEventType } from "../../src/tasks/constants";
import { Repo, Repository } from "../../src/repository";
import { sleep } from "../../src/tasks/utils";

jest.setTimeout(20000);

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

@task("simple-task")
class SimpleTask extends TaskHandler<number, number> {
  constructor() {
    super();
    console.log("SimpleTask instance created");
  }
  async run(value: number, ctx: TaskContext) {
    console.log("SimpleTask run begin", value, ctx.taskId);
    ctx.logger.info(`doubling ${value}`);
    await sleep(20);
    ctx.logger.info(`simple task done`);
    console.log("SimpleTask flush start");
    await ctx.flush();
    console.log("SimpleTask flush done");
    console.log("SimpleTask run end", value, ctx.taskId);
    return value * 2;
  }
}

@task("progressive-task")
class ProgressiveTask extends TaskHandler<number, number> {
  static leaseSnapshots: Date[] = [];

  async run(value: number, ctx: TaskContext) {
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
    return value + 1;
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
class StepOneTask extends TaskHandler<number, number> {
  async run(input: number, ctx: TaskContext) {
    const result = input + 5;
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
    const delta = input?.offset ?? 0;
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

describe.skip("Task Engine", () => {
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
      concurrency: 2,
      leaseMs: 500,
      pollMsIdle: 20,
      pollMsBusy: 10,
      logTailMax: 200,
      streamBufferSize: 5,
      maxLoggingBuffer: 500,
      loggingBufferTruncation: 50,
    };
    engine = new TaskEngine(config);
    engine.start();
    unsubscribe = eventBus.on({
      refresh: async (_, __, ___, payload) => {
        recordedEvents.push(payload as TaskEventModel);
      },
    });
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
    const id = uniqueId("simple");
    const dates = createDates();
    const task = new TaskBuilder({
      id,
      classification: "simple-task",
      input: 7,
      maxAttempts: 2,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    await engine.push(task);
    const finished = await waitForTaskCompletion(id);
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(14);
    expect(
      finished.logTail?.some((entry) => entry.msg.includes("simple task done"))
    ).toBe(true);
    const statuses = eventsFor(id, TaskEventType.STATUS).map(
      (evt) => evt.payload?.status
    );
    expect(statuses).toEqual(
      expect.arrayContaining([TaskStatus.RUNNING, TaskStatus.SUCCEEDED])
    );
    expect(eventsFor(id, TaskEventType.LOG).length).toBeGreaterThan(0);
  });

  it("emits progress updates and refreshes leases through heartbeat", async () => {
    const id = uniqueId("progress");
    const dates = createDates();
    const task = new TaskBuilder({
      id,
      classification: "progressive-task",
      input: 10,
      maxAttempts: 1,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    await engine.push(task);
    const finished = await waitForTaskCompletion(id);
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(11);
    expect(ProgressiveTask.leaseSnapshots.length).toBeGreaterThan(0);
    expect(
      ProgressiveTask.leaseSnapshots.every(
        (snapshot) => snapshot.getTime() > Date.now() - 1000
      )
    ).toBe(true);
    const progressPayloads = eventsFor(id, TaskEventType.PROGRESS).map(
      (evt) => evt.payload
    );
    expect(progressPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ percent: 0 }),
        expect.objectContaining({ percent: 100 }),
      ])
    );
  });

  it("retries a failing task, respects backoff, and eventually succeeds", async () => {
    const id = uniqueId("flaky");
    const dates = createDates();
    const task = new TaskBuilder({
      id,
      classification: "flaky-task",
      input: 1,
      maxAttempts: 3,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    await engine.push(task);
    const waiting = await waitForTaskStatus(id, TaskStatus.WAITING_RETRY);
    expect(waiting.status).toBe(TaskStatus.WAITING_RETRY);
    expect(waiting.attempt).toBe(1);
    expect(waiting.nextRunAt).toBeDefined();
    expect(waiting.error?.message).toContain("transient");
    const finished = await waitForTaskCompletion(id);
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(2);
    const statuses = eventsFor(id, TaskEventType.STATUS).map(
      (evt) => evt.payload?.status
    );
    expect(statuses).toEqual(
      expect.arrayContaining([TaskStatus.WAITING_RETRY, TaskStatus.SUCCEEDED])
    );
  });

  it("shares step outputs, stores results, and reports composite progress", async () => {
    const id = uniqueId("composite");
    const stepA = createDates();
    const stepB = createDates();
    const stepC = createDates();
    const composite = new CompositeTaskBuilder({
      id,
      classification: "composite-runner",
      atomicity: TaskType.COMPOSITE,
      steps: [
        new TaskStepSpecModel({
          classification: "step-one-task",
          input: { value: 3 },
          ...stepA,
        }),
        new TaskStepSpecModel({
          classification: "step-two-task",
          ...stepB,
        }),
        new TaskStepSpecModel({
          classification: "step-three-task",
          ...stepC,
        }),
      ],
      maxAttempts: 2,
      attempt: 0,
      ...createDates(),
      backoff: createBackoff(),
    }).build();
    await engine.push(composite);
    const finished = await waitForTaskCompletion(id);
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.stepResults).toHaveLength(3);
    expect(
      finished.stepResults?.every(
        (result) => result.status === TaskStatus.SUCCEEDED
      )
    ).toBe(true);
    expect(finished.stepResults?.[2].output).toBe(21);
    const progressPayloads = eventsFor(id, TaskEventType.PROGRESS)
      .map((evt) => evt.payload)
      .filter((payload) => typeof payload?.currentStep === "number");
    expect(progressPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currentStep: 2, totalSteps: 3 }),
        expect.objectContaining({ currentStep: 3, totalSteps: 3 }),
      ])
    );
  });

  it("resumes composite execution after a failing step and reuses cached outputs", async () => {
    const id = uniqueId("flaky-composite");
    const stepA = createDates();
    const stepB = createDates();
    const stepC = createDates();
    const composite = new CompositeTaskBuilder({
      id,
      classification: "flaky-composite-runner",
      atomicity: TaskType.COMPOSITE,
      steps: [
        new TaskStepSpecModel({
          classification: "step-one-task",
          input: { value: 4 },
          ...stepA,
        }),
        new TaskStepSpecModel({
          classification: "flaky-step-task",
          input: { offset: 7 },
          ...stepB,
        }),
        new TaskStepSpecModel({
          classification: "combine-step-task",
          ...stepC,
        }),
      ],
      maxAttempts: 3,
      attempt: 0,
      ...createDates(),
      backoff: createBackoff(),
    }).build();
    await engine.push(composite);
    const waiting = await waitForTaskStatus(id, TaskStatus.WAITING_RETRY);
    expect(waiting.stepResults?.[1].status).toBe(TaskStatus.FAILED);
    expect(waiting.stepResults?.[1].error?.message).toContain(
      "flaky step failure"
    );
    expect(FlakyStepTask.attempts[id]).toBe(1);
    const finished = await waitForTaskCompletion(id);
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.stepResults?.[0].output).toBe(9);
    expect(finished.stepResults?.[1].status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.stepResults?.[1].error).toBeUndefined();
    expect(finished.stepResults?.[2].output).toBe(25);
  });
});
