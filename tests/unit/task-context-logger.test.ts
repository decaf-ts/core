import "../../src/index";
import { RamAdapter } from "../../src/ram";
import { Adapter } from "../../src/persistence/Adapter";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskEngineConfig } from "../../src/tasks/types";
import { CompositeTaskBuilder, TaskBuilder } from "../../src/tasks/builder";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { task } from "../../src/tasks/decorators";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { BackoffStrategy, JitterStrategy, TaskEventType, TaskStatus } from "../../src/tasks/constants";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { Condition } from "../../src/query/Condition";

@task("ctxlog-atomic")
class CtxLogAtomic extends TaskHandler<void, number> {
  async run(_input: void, ctx: TaskContext): Promise<number> {
    ctx.logger.info("hello-atomic", { meta: true });
    return 1;
  }
}

@task("ctxlog-step-1")
class CtxLogStep1 extends TaskHandler<void, number> {
  async run(_input: void, ctx: TaskContext): Promise<number> {
    ctx.logger.info("hello-step-1");
    return 10;
  }
}

@task("ctxlog-step-2")
class CtxLogStep2 extends TaskHandler<void, number> {
  async run(_input: void, ctx: TaskContext): Promise<number> {
    ctx.logger.warn("hello-step-2");
    return 20;
  }
}

function configFor(adapter: RamAdapter, bus: TaskEventBus, registry: TaskHandlerRegistry): TaskEngineConfig<RamAdapter> {
  return {
    adapter,
    bus,
    registry,
    workerId: "ctxlog-worker",
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

describe("TaskContext.logger logging", () => {
  it("persists TaskLogEntryModel entries without embedding timestamp/level (atomic)", async () => {
    const alias = `ram-ctxlog-${Date.now()}-${Math.random()}`;
    const adapter = new RamAdapter(undefined, alias);
    const bus = new TaskEventBus();
    const registry = new TaskHandlerRegistry();
    const engine = new TaskEngine(configFor(adapter, bus, registry));
    await engine.start();

    try {
      const now = new Date();
      const backoff = new TaskBackoffModel({
        strategy: BackoffStrategy.FIXED,
        baseMs: 1,
        maxMs: 1,
        jitter: JitterStrategy.NONE,
      });
      const atomic = new TaskBuilder({
        classification: "ctxlog-atomic",
        maxAttempts: 1,
        attempt: 0,
        backoff,
        createdAt: now,
        updatedAt: now,
      }).build();

      const { task, tracker } = await engine.push(atomic, true);
      await expect(tracker.wait()).resolves.toBe(1);

      const finished = (await engine.track(task.id)).task;
      expect(finished.status).toBe(TaskStatus.SUCCEEDED);
      expect(finished.logTail?.length).toBeGreaterThan(0);

      const entry = (finished.logTail ?? []).find((e) => e.msg === "hello-atomic");
      expect(entry).toBeDefined();
      expect(entry?.msg).toBe("hello-atomic");
      expect(entry?.level).toBeDefined();
      expect(entry?.ts).toBeDefined();
      const tsValue: any = entry?.ts;
      if (!(tsValue instanceof Date)) {
        expect(typeof tsValue).toBe("string");
        expect(String(tsValue).length).toBeGreaterThan(0);
      }
      expect(entry?.meta).toEqual({ meta: true });
      expect(entry?.step).toBeUndefined();

      const eventsRepo = new (adapter.repository())(adapter, TaskEventModel, true).override({
        afterQueryHandlers: true,
      });
      const logEvents = await eventsRepo
        .select()
        .where(
          Condition.attribute<TaskEventModel>("taskId")
            .eq(task.id)
            .and(Condition.attribute<TaskEventModel>("classification").eq(TaskEventType.LOG))
        )
        .execute();
      const persistedLogEntries = logEvents.flatMap((e) => (e.payload ?? []) as any[]);
      expect(persistedLogEntries.some((e) => e.msg === "hello-atomic")).toBe(true);
      expect(persistedLogEntries.some((e) => typeof e.msg === "string" && /INFO|WARN|ERROR|\d{4}-\d{2}-\d{2}/.test(e.msg))).toBe(false);
    } finally {
      await engine.stop();
      Adapter.unregister(alias);
      Adapter.unregister("ram");
    }
  });

  it("sets TaskLogEntryModel.step for composite step logs", async () => {
    const alias = `ram-ctxlog-${Date.now()}-${Math.random()}`;
    const adapter = new RamAdapter(undefined, alias);
    const bus = new TaskEventBus();
    const registry = new TaskHandlerRegistry();
    const engine = new TaskEngine(configFor(adapter, bus, registry));
    await engine.start();

    try {
      const now = new Date();
      const composite = new CompositeTaskBuilder({
        classification: "ctxlog-composite",
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
      })
        .setSteps([
          { classification: "ctxlog-step-1", name: "Step 1" },
          { classification: "ctxlog-step-2", name: "Step 2" },
        ])
        .build();

      const { task, tracker } = await engine.push(composite, true);
      await expect(tracker.wait()).resolves.toBeDefined();

      const finished = (await engine.track(task.id)).task;
      expect(finished.status).toBe(TaskStatus.SUCCEEDED);

      const step1 = (finished.logTail ?? []).find((e) => e.msg === "hello-step-1");
      const step2 = (finished.logTail ?? []).find((e) => e.msg === "hello-step-2");
      expect(step1).toBeDefined();
      expect(step2).toBeDefined();
      expect(step1?.step).toBe(0);
      expect(step2?.step).toBe(1);
    } finally {
      await engine.stop();
      Adapter.unregister(alias);
      Adapter.unregister("ram");
    }
  });
});
