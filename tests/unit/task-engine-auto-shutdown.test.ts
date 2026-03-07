import "../../src/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine } from "../../src/tasks/TaskEngine";
import { TaskEngineConfig } from "../../src/tasks/types";

describe("TaskEngine auto shutdown", () => {
  it("backs off idle polling and shuts down once the limit is reached", async () => {
    const adapter = new RamAdapter();
    const config: TaskEngineConfig<RamAdapter> = {
      adapter,
      workerId: "auto-shutdown-worker",
      concurrency: 1,
      leaseMs: 100,
      pollMsIdle: 10,
      pollMsBusy: 2,
      logTailMax: 25,
      streamBufferSize: 4,
      maxLoggingBuffer: 50,
      loggingBufferTruncation: 5,
      gracefulShutdownMsTimeout: 100,
      autoShutdown: {
        enabled: true,
        backoffStepMs: 10,
        maxIdleDelayMs: 35,
      },
    };

    const engine = new TaskEngine(config);
    await engine.start();
    expect(await engine.isRunning()).toBe(true);

    await waitForAutoShutdown(engine);

    expect(await engine.isRunning()).toBe(false);
  }, 2000);
});

async function waitForAutoShutdown(engine: TaskEngine<RamAdapter>) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    const check = async () => {
      if (!(await engine.isRunning())) {
        resolve();
        return;
      }
      if (Date.now() - start > 1000) {
        reject(new Error("engine did not auto shut down in time"));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}
