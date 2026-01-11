import "../../src/overrides/index";
import { RamAdapter } from "../../src/ram";
import { TaskEngine, TaskEngineConfig } from "../../src/tasks/TaskEngine";
import { TaskHandler } from "../../src/tasks/TaskHandler";
import { task } from "../../src/tasks/decorators";
import { TaskContext } from "../../src/tasks/TaskContext";
import { sleep } from "../../src/tasks/utils";
import { TaskService } from "../../src/tasks/TaskService";
import { TaskEventBus } from "../../src/tasks/TaskEventBus";
import { TaskHandlerRegistry } from "../../src/tasks/TaskHandlerRegistry";
import { Metadata } from "@decaf-ts/decoration";

describe("Task Engine", () => {
  let adapter: RamAdapter;
  let eventBus: TaskEventBus;
  let taskRegistry: TaskHandlerRegistry;
  let engine: TaskEngine<RamAdapter>;

  @task("example")
  class TaskHandlerExample extends TaskHandler<number, number> {
    constructor() {
      super();
    }

    async run(input: number, ctx: TaskContext): Promise<number> {
      ctx.log();
      await sleep(1000);
      return input * 2;
    }
  }

  beforeAll(async () => {
    adapter = new RamAdapter();
    eventBus = new TaskEventBus();
    taskRegistry = new TaskHandlerRegistry();
  });

  it("displays the registered task handlers", async () => {
    const handlers = Metadata.tasks();
    expect(handlers).toBeDefined();
    expect(handlers["example"]).toBeDefined();
  });

  it("initializes task service", async () => {
    const taskService = new TaskService();
    await taskService.initialize({
      adapter: adapter,
      bus: eventBus,
      registry: taskRegistry,
    } as unknown as TaskEngineConfig<RamAdapter>);
    engine = taskService["engine"];
  });
});
