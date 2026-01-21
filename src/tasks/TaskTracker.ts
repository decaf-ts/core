import { Observer } from "../interfaces/Observer";
import { TaskEventModel } from "./models/TaskEventModel";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logger, LogLevel } from "@decaf-ts/logging";
import { TaskEventType, TaskStatus } from "./constants";
import { EventPipe, LogPipe, LogPipeOptions } from "./types";
import { getLogPipe } from "./logging";
import { TaskModel } from "./models/TaskModel";
import { Context, EventIds } from "../persistence/index";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskEventBus } from "./TaskEventBus";
import { ContextualArgs } from "../utils/index";

export class TaskTracker<R = any>
  implements Observer<[TaskEventModel, Context]>
{
  protected unregistration: () => void;

  private onSuccess!: (res: any) => void;
  private onFail!: (error: TaskErrorModel) => void;

  protected pipes?: Record<TaskEventType, Set<EventPipe>>;

  private readonly promise: Promise<any>;

  constructor(
    protected bus: TaskEventBus,
    private readonly task: TaskModel
  ) {
    this.unregistration = bus.observe(
      this,
      (
        table: ModelConstructor<any> | string,
        operation: string,
        id: EventIds,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ...args: ContextualArgs<any>
      ) => {
        return (
          (id as string).startsWith(this.task.id) &&
          (table === TaskEventModel ||
            table === Model.tableName(TaskEventModel))
        );
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.promise = new Promise((resolve, reject) => {
      self.onSuccess = resolve;
      self.onFail = reject;
    });

    this.pipe(this.track.bind(this));

    switch (this.task.status) {
      case TaskStatus.SUCCEEDED:
        this.succeed(task.output);
        break;
      case TaskStatus.FAILED:
        this.fail(this.task.error as TaskErrorModel);
        break;
      case TaskStatus.CANCELED:
        this.cancel(this.task.id);
        break;
      default:
      // do nothing
    }
  }

  resolve(): Promise<R> {
    return this.promise;
  }

  attach(
    log: Logger,
    opts: LogPipeOptions = { logProgress: true, logStatus: true, style: true }
  ) {
    this.pipe(getLogPipe(log, opts));
  }

  logs(pipe: LogPipe) {
    this.pipe(async (evt: TaskEventModel) => {
      if (evt.classification !== TaskEventType.LOG) return;
      const logs: [LogLevel, string, any][] = evt.payload;
      await pipe(logs);
    }, TaskEventType.LOG);
  }

  protected pipe(pipe: EventPipe, type: TaskEventType = TaskEventType.ALL) {
    this.pipes = this.pipes || ({} as Record<TaskEventType, Set<EventPipe>>);
    this.pipes[type] = this.pipes[type] || new Set<EventPipe>();
    this.pipes[type].add(pipe);
  }

  protected succeed(result: any) {
    this.unregistration();
    this.onSuccess(result);
    this.pipes = undefined;
  }
  protected fail(error: TaskErrorModel) {
    this.unregistration();
    this.onFail(error);
    this.pipes = undefined;
  }

  protected cancel(id: string) {
    this.fail(
      new TaskErrorModel({
        message: `Task ${id} canceled`,
        code: 400,
      })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async track(evt: TaskEventModel, ctx: Context) {
    if (evt.payload.status === TaskStatus.SUCCEEDED) this.succeed(evt.payload);
    if (evt.payload.status === TaskStatus.FAILED) this.fail(evt.payload);
    if (evt.payload.status === TaskStatus.CANCELED) this.cancel(evt.payload.id);
  }

  async refresh(evt: TaskEventModel, ctx: Context): Promise<void> {
    if (!this.pipes) return;
    const pipesToTrigger = this.pipes[TaskEventType.ALL]
      ? [...this.pipes[TaskEventType.ALL].values()]
      : [];
    pipesToTrigger.push(...(this.pipes[evt.classification]?.values() || []));
    for (const pipe of pipesToTrigger) {
      try {
        await pipe(evt, ctx);
      } catch (e: unknown) {
        ctx.logger.error(
          `Failed to trigger pipe ${pipe.name} for event ${evt.classification}. discarding event`,
          e as Error
        );
      }
    }
  }
}
