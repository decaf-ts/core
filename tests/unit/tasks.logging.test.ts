import { TaskLogger, getLogPipe } from "../../src/tasks/logging";
import { LogLevel, Logger, LoggingConfig, LogMeta } from "@decaf-ts/logging";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskEventType, TaskStatus } from "../../src/tasks/constants";

class TestLogger implements Logger {
  root: string[] = [];
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  debug = jest.fn();
  trace = jest.fn();
  verbose = jest.fn();
  silly = jest.fn();
  benchmark = jest.fn();
  setConfig = jest.fn();
  clear(): this {
    return this;
  }
  for(
    _config:
      | Partial<LoggingConfig>
      | string
      | { new (...args: any[]): any }
      | ((...args: any[]) => any)
      | object,
    ..._args: any[]
  ): this {
    return this;
  }
}

describe("tasks logging", () => {
  it("flushes and pipes task logs", async () => {
    const base = new TestLogger();
    const logger = new TaskLogger(base, 5, 10);

    logger.info("hello", { ok: true } as LogMeta);

    const pipe = jest.fn(async (_logs: [LogLevel, string, any][]) => undefined);
    await logger.flush(pipe);

    expect(pipe).toHaveBeenCalledTimes(1);
    const logs = pipe.mock.calls[0][0] as [LogLevel, string, any][];
    expect(logs[0][0]).toBe(LogLevel.info);
    expect(logs[0][1]).toBe("hello");
    expect(logs[0][2]).toEqual({ ok: true });
  });

  it("pipes status and progress events to loggers", async () => {
    const base = new TestLogger();
    const pipe = getLogPipe(base, {
      logProgress: true,
      logStatus: true,
      style: false,
    });

    const statusEvent = new TaskEventModel({
      taskId: "task-1",
      classification: TaskEventType.STATUS,
      payload: { status: TaskStatus.SUCCEEDED },
    });
    await pipe(statusEvent);
    expect(base.info).toHaveBeenCalledWith(
      expect.stringContaining("### STATUS")
    );

    const progressEvent = new TaskEventModel({
      taskId: "task-1",
      classification: TaskEventType.PROGRESS,
      payload: { currentStep: 2, totalSteps: 4 },
    });
    await pipe(progressEvent);
    expect(base.info).toHaveBeenCalledWith("### STEP 2/4");
  });
});
