import "../../src/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskEngineConfig } from "../../src/tasks/types";
import { TaskBuilder, CompositeTaskBuilder } from "../../src/tasks/builder";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskEventType,
  TaskStatus,
} from "../../src/tasks/constants";
import { task } from "../../src/tasks/decorators";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { Condition } from "../../src/query/Condition";
import { LogLevel } from "@decaf-ts/logging";
import { Adapter } from "../../src/persistence/Adapter";

@task("step-1")
class Step1 extends TaskHandler<void, number> {
  static runs = 0;
  async run(_input: void, ctx: TaskContext): Promise<number> {
    Step1.runs += 1;
    ctx.logger.info("s1");
    return 11;
  }
}

@task("step-2")
class Step2 extends TaskHandler<void, number> {
  static runs = 0;
  static cacheByAttempt: Record<number, any> = {};
  async run(_input: void, ctx: TaskContext): Promise<number> {
    Step2.runs += 1;
    Step2.cacheByAttempt[ctx.attempt] = ctx.resultCache?.["step-1"];
    ctx.logger.info("s2");
    if (ctx.attempt === 0) throw new Error("boom");
    return (ctx.resultCache?.["step-1"] ?? 0) + 1;
  }
}

@task("pipe-task")
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PipeTask extends TaskHandler<void, number> {
  async run(_input: void, ctx: TaskContext): Promise<number> {
    await ctx.pipe(LogLevel.info, "a", { x: 1 });
    await ctx.pipe([LogLevel.warn, "b", { y: 2 }]);
    await ctx.pipe([
      [LogLevel.info, "c", { z: 3 }],
      [LogLevel.error, "d", { w: 4 }],
    ]);
    return 123;
  }
}

function createConfig(
  adapter: RamAdapter,
  bus: TaskEventBus,
  registry: TaskHandlerRegistry
): TaskEngineConfig<RamAdapter> {
  return {
    adapter,
    bus,
    registry,
    workerId: "test-worker",
    concurrency: 1,
    leaseMs: 250,
    pollMsIdle: 5,
    pollMsBusy: 2,
    logTailMax: 100,
    streamBufferSize: 50,
    maxLoggingBuffer: 200,
    loggingBufferTruncation: 10,
    gracefulShutdownMsTimeout: 1000,
  };
}

describe("TaskEngine composite logging + retry semantics", () => {
  it("retries composite from failed step, caches previous results, and tags logTail entries with step", async () => {
    const alias = `ram-test-${Date.now()}-${Math.random()}`;
    const adapter = new RamAdapter(undefined, alias);
    const bus = new TaskEventBus();
    const registry = new TaskHandlerRegistry();
    const engine = new TaskEngine(createConfig(adapter, bus, registry));
    await engine.start();

    Step1.runs = 0;
    Step2.runs = 0;
    Step2.cacheByAttempt = {};

    const now = new Date();
    const backoff = new TaskBackoffModel({
      strategy: BackoffStrategy.FIXED,
      baseMs: 1,
      maxMs: 1,
      jitter: JitterStrategy.NONE,
    });

    const composite = new CompositeTaskBuilder({
      classification: "composite-test",
      maxAttempts: 2,
      attempt: 0,
      backoff,
      createdAt: now,
      updatedAt: now,
    })
      .setSteps([
        { classification: "step-1", name: "Step 1" },
        { classification: "step-2", name: "Step 2" },
      ])
      .build();

    try {
      const { task, tracker } = await engine.push(composite, true);
      await expect(tracker.wait()).resolves.toBeDefined();

      const finished = (await engine.track(task.id)).task;
      expect(finished.status).toBe(TaskStatus.SUCCEEDED);
      expect(finished.stepResults?.[0]?.status).toBe(TaskStatus.SUCCEEDED);
      expect(finished.stepResults?.[0]?.output).toBe(11);
      expect(finished.stepResults?.[1]?.status).toBe(TaskStatus.SUCCEEDED);
      expect(finished.stepResults?.[1]?.output).toBe(12);

      expect(Step1.runs).toBe(1);
      expect(Step2.runs).toBe(2);
      expect(Step2.cacheByAttempt[1]).toBe(11);

      expect((finished.logTail ?? []).length).toBeGreaterThan(0);
      expect(
        (finished.logTail ?? []).every((e) => typeof e.step === "number")
      ).toBe(true);
      const steps = new Set((finished.logTail ?? []).map((e) => e.step));
      expect(steps.has(0)).toBe(true);
      expect(steps.has(1)).toBe(true);

      const eventsRepo = new (adapter.repository())(
        adapter,
        TaskEventModel,
        true
      ).override({
        afterQueryHandlers: true,
      });
      const logEvents = await eventsRepo
        .select()
        .where(
          Condition.attribute<TaskEventModel>("taskId")
            .eq(task.id)
            .and(
              Condition.attribute<TaskEventModel>("classification").eq(
                TaskEventType.LOG
              )
            )
        )
        .execute();
      expect(logEvents.length).toBeGreaterThan(0);
      const persistedLogEntries = logEvents.flatMap(
        (e) => (e.payload ?? []) as any[]
      );
      expect(persistedLogEntries.length).toBeGreaterThan(0);
      expect(persistedLogEntries.some((e) => typeof e.step === "number")).toBe(
        true
      );
    } finally {
      await engine.stop();
      Adapter.unregister(alias);
      Adapter.unregister("ram");
    }
  });

  it("routes all ctx.pipe() forms to TaskModel.logTail (no persistence to task_event)", async () => {
    const alias = `ram-test-${Date.now()}-${Math.random()}`;
    const adapter = new RamAdapter(undefined, alias);
    const bus = new TaskEventBus();
    const registry = new TaskHandlerRegistry();
    const engine = new TaskEngine(createConfig(adapter, bus, registry));
    await engine.start();

    const now = new Date();
    const atomic = new TaskBuilder({
      classification: "pipe-task",
      maxAttempts: 1,
      attempt: 0,
      backoff: new TaskBackoffModel({
        strategy: BackoffStrategy.FIXED,
        baseMs: 1,
        maxMs: 1,
        jitter: JitterStrategy.NONE,
      }),
      createdAt: now,
      updatedAt: now,
    }).build();

    try {
      const { task, tracker } = await engine.push(atomic, true);
      await expect(tracker.wait()).resolves.toBe(123);

      const finished = (await engine.track(task.id)).task;
      const msgs = (finished.logTail ?? []).map((e) => e.msg);
      expect(msgs).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
      expect((finished.logTail ?? []).every((e) => e.step === undefined)).toBe(
        true
      );

      const eventsRepo = new (adapter.repository())(
        adapter,
        TaskEventModel,
        true
      ).override({
        afterQueryHandlers: true,
      });
      const logEvents = await eventsRepo
        .select()
        .where(
          Condition.attribute<TaskEventModel>("taskId")
            .eq(task.id)
            .and(
              Condition.attribute<TaskEventModel>("classification").eq(
                TaskEventType.LOG
              )
            )
        )
        .execute();
      expect(logEvents.length).toBeGreaterThan(0);
      const persistedLogEntries = logEvents.flatMap(
        (e) => (e.payload ?? []) as any[]
      );
      expect(persistedLogEntries.length).toBeGreaterThan(0);
      expect(persistedLogEntries.every((e) => e.step === undefined)).toBe(true);
    } finally {
      await engine.stop();
      Adapter.unregister(alias);
      Adapter.unregister("ram");
    }
  });
});
