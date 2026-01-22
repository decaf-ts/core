import { computeBackoffMs, serializeError } from "../../src/tasks/utils";
import { TaskBackoffModel } from "../../src/tasks/models/TaskBackoffModel";
import { BackoffStrategy, JitterStrategy } from "../../src/tasks/constants";
import { TaskBackoffBuilder } from "../../src/tasks/builder";
import { TaskErrorModel } from "../../src/tasks/models/TaskErrorModel";

describe("tasks utils", () => {
  it("computes deterministic backoff without jitter", () => {
    const cfg = new TaskBackoffModel({
      baseMs: 1000,
      maxMs: 8000,
      strategy: BackoffStrategy.EXPONENTIAL,
      jitter: JitterStrategy.NONE,
    });

    expect(computeBackoffMs(1, cfg)).toBe(1000);
    expect(computeBackoffMs(2, cfg)).toBe(2000);
    expect(computeBackoffMs(4, cfg)).toBe(8000);
    expect(computeBackoffMs(6, cfg)).toBe(8000);
  });

  it("computes jittered backoff", () => {
    const cfg = new TaskBackoffModel({
      baseMs: 1000,
      maxMs: 2000,
      strategy: BackoffStrategy.FIXED,
      jitter: JitterStrategy.FULL,
    });
    const spy = jest.spyOn(Math, "random").mockReturnValue(0.5);
    expect(computeBackoffMs(1, cfg)).toBe(500);
    spy.mockRestore();
  });

  it("serializes errors into TaskErrorModel", () => {
    const err = new Error("boom");
    err.stack = "stack";
    const serialized = serializeError(err);
    expect(serialized).toBeInstanceOf(TaskErrorModel);
    expect(serialized.message).toBe("boom");
    expect(serialized.stack).toBe("stack");
  });

  it("builds backoff models with TaskBackoffBuilder", () => {
    const built = new TaskBackoffBuilder()
      .setBaseMs(2000)
      .setMaxMs(4000)
      .setJitter(JitterStrategy.NONE)
      .setStrategy(BackoffStrategy.FIXED)
      .build();

    expect(built).toBeInstanceOf(TaskBackoffModel);
    expect(built.baseMs).toBe(2000);
    expect(built.maxMs).toBe(4000);
    expect(built.jitter).toBe(JitterStrategy.NONE);
    expect(built.strategy).toBe(BackoffStrategy.FIXED);
  });
});
