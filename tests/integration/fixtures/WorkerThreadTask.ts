import { task, TaskHandler, TaskContext } from "../../../src/tasks";

type WorkerInput = {
  value?: number;
  delayMs?: number;
};

@task("worker-thread-task")
export class WorkerThreadTask extends TaskHandler<WorkerInput, number> {
  async run(input: WorkerInput, ctx: TaskContext): Promise<number> {
    const base = typeof input?.value === "number" ? input.value : 0;
    const delay = typeof input?.delayMs === "number" ? input.delayMs : 0;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    let accumulator = 0;
    for (let i = 0; i < 1000; i += 1) {
      accumulator += i;
    }
    ctx.logger.info(`worker handled payload ${base}`);
    return base + accumulator;
  }
}

type GatedInput = {
  gate: string;
};

// fails while the `gate` file exists, so tests can drive failure/success across threads
@task("worker-thread-gated-task")
export class WorkerThreadGatedTask extends TaskHandler<GatedInput, string> {
  async run(input: GatedInput, ctx: TaskContext): Promise<string> {
    const { existsSync } = await import("node:fs");
    if (existsSync(input.gate)) throw new Error(`gate closed: ${input.gate}`);
    ctx.logger.info(`gated task passed ${input.gate}`);
    return "gate-open";
  }
}
