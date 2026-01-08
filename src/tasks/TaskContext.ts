import { Context } from "../persistence/index";
import { ITaskContext } from "./types";

export class TaskContext extends Context<ITaskContext> {
  get taskId(): string {
    return this.get("taskId");
  }
  get log(): any {
    return this.get("log");
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

  constructor(ctx?: Context<any>) {
    super(ctx);
  }
}
