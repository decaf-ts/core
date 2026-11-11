import { it } from "@decaf-ts/for-testing";
import { Logging, LogLevel } from "@decaf-ts/logging";
import { Lock } from "@decaf-ts/transactional-decorators";
import { Context } from "../../src/persistence/Context";
import { TaskContext } from "../../src/tasks/TaskContext";
import { TaskLogger } from "../../src/tasks/logging";

const taskContext = () =>
  new TaskContext().accumulate({
    taskId: "task-1",
    attempt: 2,
    tenant: "acme", // an arbitrary override the steps rely on
    stepWriteLock: new Lock(),
    resultCache: { "task.attempt": 2 },
    logger: new TaskLogger(Logging.for("step-context-test"), 50, 100),
  } as any) as TaskContext;

describe("TaskContext.forStep", () => {
  it("exposes every flag and override of the task context", () => {
    const parent = taskContext();
    const step = TaskContext.forStep(parent, 1);
    expect(step.taskId).toBe("task-1");
    expect(step.attempt).toBe(2);
    expect(step.get("tenant" as any)).toBe("acme");
    expect(step.stepWriteLock).toBe(parent.stepWriteLock);
    expect(step.resultCache).toBe(parent.resultCache);
  });

  it("shares writes both ways with the task context and with later steps", () => {
    const parent = taskContext();
    const first = TaskContext.forStep(parent, 0);

    first.accumulate({ fromAccumulate: 1 } as any);
    first.cache.put("fromPut" as any, 2 as any);
    first.cacheResult("step-0-output", 3);
    expect(parent.get("fromAccumulate" as any)).toBe(1);
    expect(parent.get("fromPut" as any)).toBe(2);
    expect(parent.resultCache["step-0-output"]).toBe(3);

    const second = TaskContext.forStep(parent, 1);
    expect(second.get("fromAccumulate" as any)).toBe(1);
    expect(second.get("fromPut" as any)).toBe(2);
    expect(second.resultCache["step-0-output"]).toBe(3);

    parent.accumulate({ addedLater: 4 } as any);
    expect(first.get("addedLater" as any)).toBe(4);
    expect(second.get("addedLater" as any)).toBe(4);

    first.accumulate({ tenant: "changed" } as any);
    expect(second.get("tenant" as any)).toBe("changed");
  });

  it("keeps the step index, logger view and step schedulers local to each step", () => {
    const parent = taskContext();
    const a = TaskContext.forStep(parent, 0);
    const b = TaskContext.forStep(parent, 1);
    expect(a.step).toBe(0);
    expect(b.step).toBe(1);
    expect(parent.step).toBeUndefined();

    const scheduler = async () => undefined;
    a.cache.put("scheduleCompositeSteps" as any, scheduler as any);
    expect(a.getOrUndefined("scheduleCompositeSteps")).toBe(scheduler);
    expect(b.getOrUndefined("scheduleCompositeSteps")).toBeUndefined();
    expect(parent.getOrUndefined("scheduleCompositeSteps")).toBeUndefined();

    a.setStep(5);
    expect(a.step).toBe(5);
    expect(b.step).toBe(1);
    expect(parent.step).toBeUndefined();

    expect(a.logger).not.toBe(parent.logger);
    expect(a.logger).toBeInstanceOf(TaskLogger);
  });

  it("buffers step logs in the shared task logger, tagged with their step", () => {
    const parent = taskContext();
    const a = TaskContext.forStep(parent, 0);
    const b = TaskContext.forStep(parent, 1);
    a.logger.info("from a");
    b.logger.warn("from b", { some: "meta" });
    a.logger.for("nested").info("from a nested");
    parent.logger.info("from task");
    b.logger.error("b failed", new Error("boom"), { extra: true });

    const flushed = parent.logger.flush();
    expect(flushed).toEqual([
      [LogLevel.info, "from a", undefined, 0],
      [LogLevel.warn, "from b", { some: "meta" }, 1],
      [LogLevel.info, "from a nested", undefined, 0],
      [LogLevel.info, "from task", undefined],
      [LogLevel.error, "b failed", expect.any(Error), 1],
    ]);
  });

  it("carries the step view into contexts derived from the step context", () => {
    const parent = taskContext();
    const step = TaskContext.forStep(parent, 3);

    const wrapped = new TaskContext(step);
    expect(wrapped.step).toBe(3);
    wrapped.accumulate({ fromWrapped: true } as any);
    expect(parent.get("fromWrapped" as any)).toBe(true);

    const copied = Context.childFrom(step as any) as Context<any>;
    expect(copied.get("step" as any)).toBe(3);
    expect(copied.get("tenant" as any)).toBe("acme");
  });
});
