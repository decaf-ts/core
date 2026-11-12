import { it } from "@decaf-ts/for-testing";
import "../../src/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEngineConfig } from "../../src/tasks/types";

const within = <T>(promise: Promise<T>, ms = 500): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not settle within ${ms}ms`)), ms)
    ),
  ]);

describe("TaskEngine start/stop", () => {
  const config = (): TaskEngineConfig<RamAdapter> => ({
    adapter: new RamAdapter(),
    workerId: "start-stop-worker",
    concurrency: 1,
    leaseMs: 100,
    pollMsIdle: 10,
    pollMsBusy: 2,
    logTailMax: 25,
    streamBufferSize: 4,
    maxLoggingBuffer: 50,
    loggingBufferTruncation: 5,
    gracefulShutdownMsTimeout: 100,
    autoShutdown: { enabled: false },
  });

  it("starting an already running engine keeps it usable", async () => {
    const engine = new TaskEngine(config());
    await within(engine.start());
    await within(engine.start());

    // a start that kept the engine lock would hang every later lock user
    expect(await within(engine.isRunning())).toBe(true);
    await within(engine.stop());
    expect(await within(engine.isRunning())).toBe(false);
  });
});
