import { Context } from "../persistence/Context";
import { TaskFlags } from "./types";
import { TaskLogger } from "./logging";
import { DateTarget } from "@decaf-ts/decorator-validation";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskStatus } from "./constants";
import { serializeError } from "./utils";
import { TaskStateChangeError, TaskStateChangeRequest } from "./TaskStateChangeError";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";
import { InternalError } from "@decaf-ts/db-decorators";

export class TaskContext extends Context<TaskFlags> {
  get taskId(): string {
    return this.get("taskId");
  }

  override get logger(): TaskLogger<any> {
    return super.logger;
  }

  get step(): number | undefined {
    return this.getOrUndefined("step" as any) as any;
  }

  setStep(step?: number): void {
    this.cache.put("step" as any, step as any);
  }

  get pipe(): TaskFlags["pipe"] {
    const fn = this.get("pipe") as any;
    return fn.bind(this);
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

  protected changeState(status: TaskStatus, payload?: Partial<TaskStateChangeRequest>): never {
    throw new TaskStateChangeError({
      status,
      ...payload,
    });
  }

  cancel(
    reason?: string | Error | TaskErrorModel,
    details?: any
  ): never {
    this.changeState(TaskStatus.CANCELED, {
      error: this.toTaskError(reason, details),
    });
  }

  retry(reason?: string | Error | TaskErrorModel): never {
    this.changeState(TaskStatus.WAITING_RETRY, {
      error: this.toTaskError(reason),
    });
  }

  reschedule(
    when: DateTarget,
    reason?: string | Error | TaskErrorModel
  ): never {
    const scheduledTo: Date = when instanceof Date ? when : when.build();
    this.changeState(TaskStatus.SCHEDULED, {
      error: this.toTaskError(reason),
      scheduledTo,
    });
  }

  private toTaskError(
    value?: string | Error | TaskErrorModel,
    details?: any
  ): TaskErrorModel | undefined {
    if (!value && !details) return undefined;
    if (value instanceof TaskErrorModel) return value;
    if (value instanceof Error) return serializeError(value);
    return new TaskErrorModel({
      message: String(value ?? "Task requested state change"),
      details,
    });
  }

  get resultCache() {
    return this.get("resultCache");
  }

  scheduleSteps(...steps: (TaskStepSpecModel | Partial<TaskStepSpecModel>)[]) {
    const normalized = (steps ?? []).map((step) =>
      step instanceof TaskStepSpecModel ? step : new TaskStepSpecModel(step)
    );
    return {
      afterCurrent: async (ctx: TaskContext): Promise<void> => {
        const scheduler = this.getOrUndefined("scheduleCompositeSteps");
        if (!scheduler) {
          throw new InternalError(
            "scheduleSteps().afterCurrent() is only available while running a composite task step"
          );
        }
        await scheduler(normalized, ctx);
      },
      atEnd: async (ctx: TaskContext): Promise<void> => {
        const scheduler = this.getOrUndefined("scheduleCompositeStepsAtEnd");
        if (!scheduler) {
          throw new InternalError(
            "scheduleSteps().atEnd() is only available while running a composite task step"
          );
        }
        await scheduler(normalized, ctx);
      },
    };
  }

  constructor(ctx?: Context<any>) {
    super(ctx);
  }
}
