import { Context } from "../persistence/Context";
import { TaskFlags } from "./types";
import { TaskLogger } from "./logging";

export class TaskContext extends Context<TaskFlags> {
  get taskId(): string {
    return this.get("taskId");
  }

  override get logger(): TaskLogger<any> {
    return super.logger;
  }
  get pipe(): any {
    return this.get("pipe");
  }

  flush() {
    return this.get("flush")();
  }

  get attempt(): number {
    return this.get("attempt");
  }
  get progress(): (data: any) => Promise<void> {
    return this.get("progress");
  }

  get heartbeat(): () => Promise<void> {
    return this.get("heartbeat");
  }

  cacheResult(taskId: string, payload: any) {
    const cache =
      (this.cache.has("resultCache") && this.cache.get("resultCache")) ||
      ({} as Record<string, any>);
    cache[taskId] = payload;
    this.cache.put("resultCache", cache);
  }

  get resultCache() {
    return this.get("resultCache");
  }

  constructor(ctx?: Context<any>) {
    super(ctx);
  }
}
