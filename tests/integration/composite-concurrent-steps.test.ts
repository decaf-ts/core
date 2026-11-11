import "../../src/index";
import "../../src/overrides/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { task } from "../../src/tasks/decorators";
import { CompositeTaskBuilder } from "../../src/tasks/builder";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskStepSpecModel } from "../../src/tasks/models/TaskStepSpecModel";
import {
  BackoffStrategy,
  JitterStrategy,
  TaskStatus,
  TaskType,
} from "../../src/tasks/constants";
import { Repo, Repository } from "../../src/repository";
import { TaskService } from "../../src/index";
import { TaskEngineConfig } from "../../src/tasks/index";
import { sleep } from "../../src/tasks/utils";

jest.setTimeout(30000);

type ProbeInput = { label: string; delayMs?: number; fail?: boolean };
type Seen = {
  label: string;
  stepAtStart?: number;
  stepAtEnd?: number;
  cache: unknown;
  shared?: unknown;
  started: number;
  ended?: number;
};

// what each handler observed, per task id
const seen: Record<string, Seen[]> = {};
const sequentialCaches: Record<string, unknown[]> = {};
const appended: Record<string, boolean> = {};

const parse = <T>(input: unknown): T =>
  (typeof input === "string" ? JSON.parse(input) : input) as T;
const record = (ctx: TaskContext, entry: Seen) => {
  (seen[ctx.taskId] = seen[ctx.taskId] ?? []).push(entry);
  return entry;
};

/** concurrent probe: reports what it sees before and after its siblings started */
@task("cc-probe")
class ConcurrentProbe extends TaskHandler<ProbeInput, { label: string; step?: number }> {
  async run(input: ProbeInput, ctx: TaskContext) {
    const { label, delayMs = 150, fail } = parse<ProbeInput>(input);
    const entry = record(ctx, {
      label,
      stepAtStart: ctx.step,
      cache: ctx.cache,
      shared: ctx.getOrUndefined("cc-shared" as any),
      started: Date.now(),
    });
    ctx.logger.info(`cc ${label} start`);
    await sleep(delayMs);
    entry.stepAtEnd = ctx.step;
    entry.ended = Date.now();
    ctx.logger.info(`cc ${label} end`);
    if (fail) throw new Error(`cc ${label} failed`);
    // written while siblings run: must reach the shared task context
    ctx.accumulate({ [`cc-wrote-${label}`]: ctx.step } as any);
    return { label, step: ctx.step };
  }
}

/** sequential step seeding a value into the shared context */
@task("cc-seed")
class SequentialSeed extends TaskHandler<unknown, string> {
  async run(_: unknown, ctx: TaskContext) {
    (sequentialCaches[ctx.taskId] = sequentialCaches[ctx.taskId] ?? []).push(ctx.cache);
    ctx.accumulate({ "cc-shared": "seeded" } as any);
    return "seeded";
  }
}

/** sequential step reading what the concurrent batch wrote */
@task("cc-collect")
class SequentialCollect extends TaskHandler<{ labels: string[] }, Record<string, unknown>> {
  async run(input: { labels: string[] }, ctx: TaskContext) {
    (sequentialCaches[ctx.taskId] = sequentialCaches[ctx.taskId] ?? []).push(ctx.cache);
    const { labels } = parse<{ labels: string[] }>(input);
    return Object.fromEntries(
      labels.map((label) => [label, ctx.getOrUndefined(`cc-wrote-${label}` as any)])
    );
  }
}

/** concurrent step that appends a tail step while its sibling is still running */
@task("cc-append")
class ConcurrentAppend extends TaskHandler<ProbeInput, string> {
  async run(input: ProbeInput, ctx: TaskContext) {
    const { label, delayMs = 50 } = parse<ProbeInput>(input);
    record(ctx, { label, stepAtStart: ctx.step, cache: ctx.cache, started: Date.now() });
    await sleep(delayMs);
    if (!appended[ctx.taskId]) {
      appended[ctx.taskId] = true;
      await ctx
        .scheduleSteps(new TaskStepSpecModel({ classification: "cc-tail", input: {} }))
        .atEnd(ctx);
    }
    return label;
  }
}

@task("cc-tail")
class ConcurrentTail extends TaskHandler<unknown, string> {
  async run(_: unknown, ctx: TaskContext) {
    return `tail@${ctx.step}`;
  }
}

expect([
  ConcurrentProbe,
  SequentialSeed,
  SequentialCollect,
  ConcurrentAppend,
  ConcurrentTail,
]).toBeDefined();

let engine: TaskEngine<RamAdapter>;
let taskRepo: Repo<TaskModel>;

const backoff = () =>
  new TaskBackoffModel({
    baseMs: 10,
    maxMs: 20,
    strategy: BackoffStrategy.FIXED,
    jitter: JitterStrategy.NONE,
  });

const concurrent = (classification: string, input: Partial<ProbeInput>) =>
  new TaskStepSpecModel({
    classification,
    input,
    allowConcurrent: true,
    lock: "cc-batch",
  });
const sequential = (classification: string, input: unknown = {}) =>
  new TaskStepSpecModel({ classification, input });

const run = async (steps: TaskStepSpecModel[]) => {
  const composite = new CompositeTaskBuilder({
    classification: "cc-composite",
    atomicity: TaskType.COMPOSITE,
    maxAttempts: 1,
    backoff: backoff(),
  })
    .setSteps(steps)
    .build();
  const { task: created, tracker } = await engine.push(composite, true);
  let error: unknown;
  try {
    await tracker.resolve();
  } catch (e: unknown) {
    error = e;
  }
  return { task: await taskRepo.read(created.id), error };
};

const byLabel = (taskId: string) =>
  Object.fromEntries((seen[taskId] ?? []).map((entry) => [entry.label, entry]));

describe("composite concurrent step batches", () => {
  beforeAll(async () => {
    const adapter = new RamAdapter();
    taskRepo = Repository.forModel(TaskModel, adapter.alias);
    const config: TaskEngineConfig<RamAdapter> = {
      adapter,
      bus: new TaskEventBus(),
      registry: new TaskHandlerRegistry(),
      workerId: "cc-worker",
      concurrency: 2,
      leaseMs: 2000,
      pollMsIdle: 30,
      pollMsBusy: 15,
      logTailMax: 5000,
      streamBufferSize: 5,
      maxLoggingBuffer: 500,
      loggingBufferTruncation: 50,
      gracefulShutdownMsTimeout: 2000,
    };
    const service = new TaskService<RamAdapter>();
    await service.boot(config);
    engine = service.client;
    await engine.start();
  });

  afterAll(async () => {
    await engine?.stop();
  });

  it("runs batch steps in parallel, each seeing its own step index throughout", async () => {
    const { task } = await run([
      concurrent("cc-probe", { label: "a", delayMs: 200 }),
      concurrent("cc-probe", { label: "b", delayMs: 150 }),
      concurrent("cc-probe", { label: "c", delayMs: 100 }),
    ]);
    expect(task.status).toBe(TaskStatus.SUCCEEDED);
    const probes = byLabel(task.id);

    // overlapping execution: every step started before the first one ended
    const firstEnd = Math.min(...Object.values(probes).map((p) => p.ended!));
    expect(Object.values(probes).every((p) => p.started < firstEnd)).toBe(true);

    expect(probes.a.stepAtStart).toBe(0);
    expect(probes.b.stepAtStart).toBe(1);
    expect(probes.c.stepAtStart).toBe(2);
    // still correct after the siblings started (they used to overwrite it)
    expect(probes.a.stepAtEnd).toBe(0);
    expect(probes.b.stepAtEnd).toBe(1);
    expect(probes.c.stepAtEnd).toBe(2);

    expect(task.stepResults?.map((r) => r.output)).toEqual([
      { label: "a", step: 0 },
      { label: "b", step: 1 },
      { label: "c", step: 2 },
    ]);
  });

  it("attributes each step's buffered handler logs to that step", async () => {
    const { task } = await run([
      concurrent("cc-probe", { label: "a", delayMs: 150 }),
      concurrent("cc-probe", { label: "b", delayMs: 100 }),
    ]);
    const stepsOf = (label: string) =>
      new Set(
        (task.logTail ?? [])
          .filter((entry) => entry.msg.startsWith(`cc ${label} `))
          .map((entry) => entry.step)
      );
    expect(stepsOf("a")).toEqual(new Set([0]));
    expect(stepsOf("b")).toEqual(new Set([1]));
    expect(
      (task.logTail ?? []).filter((entry) => entry.msg.startsWith("cc ")).length
    ).toBe(4);
  });

  it("shares the task context with batch steps in both directions", async () => {
    const { task } = await run([
      sequential("cc-seed"),
      concurrent("cc-probe", { label: "a", delayMs: 120 }),
      concurrent("cc-probe", { label: "b", delayMs: 60 }),
      sequential("cc-collect", { labels: ["a", "b"] }),
    ]);
    expect(task.status).toBe(TaskStatus.SUCCEEDED);
    const probes = byLabel(task.id);

    // values a previous (sequential) step wrote are visible inside the batch
    expect(probes.a.shared).toBe("seeded");
    expect(probes.b.shared).toBe("seeded");
    // values written inside the batch reach the following steps
    expect(task.stepResults?.[3]?.output).toEqual({ a: 1, b: 2 });
  });

  it("keeps sequential steps on the very same context, batch steps on per-step views", async () => {
    const { task } = await run([
      sequential("cc-seed"),
      concurrent("cc-probe", { label: "a", delayMs: 60 }),
      concurrent("cc-probe", { label: "b", delayMs: 30 }),
      sequential("cc-collect", { labels: ["a", "b"] }),
    ]);
    const [before, after] = sequentialCaches[task.id];
    expect(before).toBe(after);
    const probes = byLabel(task.id);
    expect(probes.a.cache).not.toBe(before);
    expect(probes.b.cache).not.toBe(before);
    expect(probes.a.cache).not.toBe(probes.b.cache);
  });

  it("records a failing batch step at its own index and lets siblings finish", async () => {
    const { task, error } = await run([
      concurrent("cc-probe", { label: "a", delayMs: 120 }),
      concurrent("cc-probe", { label: "b", delayMs: 40, fail: true }),
      concurrent("cc-probe", { label: "c", delayMs: 80 }),
      sequential("cc-collect", { labels: ["a", "c"] }),
    ]);
    expect(error).toBeDefined();
    expect(task.status).toBe(TaskStatus.FAILED);
    expect(task.stepResults?.[0]).toMatchObject({
      status: TaskStatus.SUCCEEDED,
      output: { label: "a", step: 0 },
    });
    expect(task.stepResults?.[1]?.status).toBe(TaskStatus.FAILED);
    expect(task.stepResults?.[1]?.error?.message).toContain("cc b failed");
    expect(task.stepResults?.[2]).toMatchObject({
      status: TaskStatus.SUCCEEDED,
      output: { label: "c", step: 2 },
    });
    expect(task.currentStep).toBe(1);
    expect(task.stepResults?.[3]).toBeUndefined();
  });

  it("appends steps scheduled atEnd() from a batch step after the whole batch", async () => {
    const { task } = await run([
      concurrent("cc-append", { label: "a", delayMs: 20 }),
      concurrent("cc-probe", { label: "b", delayMs: 120 }),
    ]);
    expect(task.status).toBe(TaskStatus.SUCCEEDED);
    expect(task.steps?.map((s) => s.classification)).toEqual([
      "cc-append",
      "cc-probe",
      "cc-tail",
    ]);
    expect(task.stepResults?.map((r) => r.output)).toEqual([
      "a",
      { label: "b", step: 1 },
      "tail@2",
    ]);
  });
});
