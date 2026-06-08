import { TaskLogger, getLogPipe } from "../../src/tasks/logging";
import { LogLevel, Logger, LoggingConfig, LogMeta } from "@decaf-ts/logging";
import { TaskEventModel } from "../../src/tasks/models/TaskEventModel";
import { TaskEventType, TaskStatus } from "../../src/tasks/constants";

class TestLogger implements Logger {
  root: string[] = [];
  forCalls: any[][] = [];
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
    this.forCalls.push([_config, ..._args]);
    return this;
  }
}

describe("tasks logging", () => {
  it("flushes and pipes task logs", async () => {
    const base = new TestLogger();
    const logger = new TaskLogger(base, 5, 10);

    logger.info("hello", { ok: true } as LogMeta);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  it("pipes log events to loggers", async () => {
    const base = new TestLogger();
    const pipe = getLogPipe(base, {
      logProgress: false,
      logStatus: false,
      style: false,
    });

    const logEvent = new TaskEventModel({
      taskId: "task-1",
      classification: TaskEventType.LOG,
      payload: [
        {
          ts: new Date("2020-01-01T00:00:00.000Z"),
          level: LogLevel.info,
          msg: "hello",
          meta: { ok: true },
          step: 1,
        },
      ],
    });

    await pipe(logEvent);
    expect(base.forCalls.length).toBeGreaterThan(0);
    const [firstForConfig, secondForConfig] = base.forCalls[0];
    expect(firstForConfig).toBe("task-1");
    expect(secondForConfig).toEqual(
      expect.not.objectContaining({ timestamp: false, logLevel: false })
    );
    expect(base.info).toHaveBeenCalledTimes(1);
    expect(base.info.mock.calls[0][0]).toEqual(expect.stringContaining("hello"));
    expect(base.info.mock.calls[0][0]).toEqual(
      expect.not.stringContaining("2020-01-01")
    );
    expect(base.info.mock.calls[0][1]).toEqual({ ok: true });
  });

  it("UPDATE event logs step change when logProgress is true", async () => {
    const base = new TestLogger();
    const pipe = getLogPipe(base, {
      logProgress: true,
      logStatus: false,
      style: false,
    });

    const updateEvent = new TaskEventModel({
      taskId: "task-1",
      classification: TaskEventType.UPDATE,
      payload: {
        status: "update",
        currentStep: 0,
        totalSteps: 3,
        output: { added: 1, insertionIndex: 1 },
      },
    });

    // Before the fix this threw: InternalError("Unknown task event classification: update")
    await expect(pipe(updateEvent)).resolves.toBeUndefined();
    expect(base.info).toHaveBeenCalledWith(
      expect.stringContaining("### UPDATE step 0/3 (+1 at index 1)")
    );
  });

  it("UPDATE event is silently ignored when logProgress is false", async () => {
    const base = new TestLogger();
    const pipe = getLogPipe(base, {
      logProgress: false,
      logStatus: false,
      style: false,
    });

    const updateEvent = new TaskEventModel({
      taskId: "task-1",
      classification: TaskEventType.UPDATE,
      payload: {
        status: "update",
        currentStep: 0,
        totalSteps: 2,
        output: { added: 1, insertionIndex: 1 },
      },
    });

    await expect(pipe(updateEvent)).resolves.toBeUndefined();
    expect(base.info).not.toHaveBeenCalled();
  });

  it("unknown classification logs a warning instead of throwing", async () => {
    const base = new TestLogger();
    const pipe = getLogPipe(base, { logProgress: true, logStatus: true, style: false });

    const unknownEvent = new TaskEventModel({
      taskId: "task-1",
      classification: "future-unknown-type" as TaskEventType,
      payload: {},
    });

    // Before the fix this threw: InternalError("Unknown task event classification: future-unknown-type")
    await expect(pipe(unknownEvent)).resolves.toBeUndefined();
    expect(base.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unhandled task event classification: future-unknown-type")
    );
  });
});
