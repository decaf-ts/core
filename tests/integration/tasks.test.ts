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
import { TaskStepSpecModel } from "../../src/tasks/models/TaskStepSpecModel";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskEventType, TaskStatus, TaskType } from "../../src/tasks/constants";
import { Repo, Repository } from "../../src/repository";
import { sleep } from "../../src/tasks/utils";
import {
  AllOperationKeys,
  Context,
  EventIds,
  Observer,
  PersistenceObserver,
} from "../../src/index";
import { Constructor } from "@decaf-ts/decoration";
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

class TaskEventObserver implements PersistenceObserver<any> {
  constructor(
    protected readonly cb: (evt: TaskEventModel) => void | Promise<void>
  ) {}

  async refresh(
    table: Constructor | string,
    operation: AllOperationKeys,
    id: EventIds,
    payload: TaskEventModel,
    ctx: Context
  ): Promise<void> {
    const log = ctx.logger.for(this.refresh);
    log.verbose(`task event: ${payload.classification} ${payload.taskId}`);
    log.debug(`task event: ${payload.taskId}`, payload);
    if (payload.classification === TaskEventType.STATUS)
      return this.cb(payload);
  }
}

class TaskObserver implements PersistenceObserver<any> {
  constructor(
    protected readonly cb: (evt: TaskModel) => void | Promise<void>
  ) {}

  async refresh(
    table: Constructor | string,
    operation: AllOperationKeys,
    id: EventIds,
    payload: TaskModel,
    ctx: Context
  ): Promise<void> {
    const log = ctx.logger.for(this.refresh);
    log.verbose(`task: ${payload.classification} ${payload.id}`);
    log.debug(`task: ${payload.id}`, payload);
    if (payload.classification === TaskEventType.STATUS)
      return this.cb(payload);
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
      pollMsIdle: 20,
      pollMsBusy: 10,
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
      input: 7,
      maxAttempts: 2,
      attempt: 0,
      ...dates,
      backoff: createBackoff(),
    }).build();
    const logMock = jest.fn();
    const { task, tracker } = await engine.push(toSubmit, true);
    tracker.logs(logMock);
    const finished = await tracker.resolve();
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);
    expect(finished.output).toBe(14);
  });
});
