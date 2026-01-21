import "../../src/index";
import { RamAdapter } from "../../src/ram";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { TaskService } from "../../src/tasks/TaskService";
import { TaskBuilder } from "../../src/tasks/builder";
import { task } from "../../src/tasks/decorators";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { TaskContext } from "../../src/tasks/TaskContext";
import { TaskEngineConfig } from "../../src/tasks/types";

@task("service-task")
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class ServiceTask extends TaskHandler<number | { value: number }, number> {
  async run(input: number | { value: number }, ctx: TaskContext) {
    let value: number | undefined;
    if (typeof input === "number") value = input;
    if (typeof input === "string") {
      try {
        const parsed = JSON.parse(input);
        value =
          typeof parsed === "number"
            ? parsed
            : typeof parsed?.value === "number"
              ? parsed.value
              : undefined;
      } catch {
        const parsed = Number(input);
        value = Number.isNaN(parsed) ? undefined : parsed;
      }
    }
    if (input && typeof input === "object" && typeof input.value === "number")
      value = input.value;
    if (typeof value !== "number")
      throw new Error("invalid service-task input");
    await ctx.flush();
    return value + 1;
  }
}

describe("TaskService", () => {
  it("starts the engine and runs created tasks", async () => {
    const now = new Date();
    const adapter = new RamAdapter();
    const bus = new TaskEventBus();
    const registry = new TaskHandlerRegistry();
    const config: TaskEngineConfig<RamAdapter> = {
      adapter,
      bus,
      registry,
      workerId: "service-worker",
      concurrency: 1,
      leaseMs: 200,
      pollMsIdle: 10,
      pollMsBusy: 5,
      logTailMax: 50,
      streamBufferSize: 5,
      maxLoggingBuffer: 50,
      loggingBufferTruncation: 10,
      gracefulShutdownMsTimeout: 1000,
    };

    const service = new TaskService<RamAdapter>();
    await service.boot(config);

    const task = await service.create(
      new TaskBuilder({
        classification: "service-task",
        input: { value: 4 },
        maxAttempts: 1,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      }).build()
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await service.client.isRunning()).toBe(true);

    const { tracker } = await service.client.track(task.id);
    const result = await tracker.resolve();
    expect(result).toBe(5);

    await service.shutdown();
  });
});
