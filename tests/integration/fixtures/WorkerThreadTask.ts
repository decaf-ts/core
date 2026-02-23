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
    await ctx.flush();
    return base + accumulator;
  }
}
