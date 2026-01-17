import { Observer } from "../interfaces/Observer";
import { TaskEventModel } from "./models/TaskEventModel";
import { Observable } from "../interfaces/index";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";
import { TaskEventType, TaskStatus } from "./constants";
import { EventPipe, LogPipeOptions } from "./types";
import { getLogPipe } from "./logging";
import { TaskModel } from "./models/TaskModel";
import { Context } from "../persistence/index";
import { TaskErrorModel } from "./models/TaskErrorModel";

export class TaskTracker<R = any>
  implements Observer<[TaskEventModel, Context]>
{
  protected unregistration: () => void;

  private onSuccess!: (res: any) => void;
  private onFail!: (error: TaskErrorModel) => void;

  protected pipes?: Record<TaskEventType, Set<EventPipe>>;

  private readonly promise: Promise<any>;

  constructor(
    protected taskEngine: Observable<
      any,
      [ModelConstructor<any>, string, string, TaskEventModel]
    >,
    private readonly task: TaskModel
  ) {
    this.unregistration = taskEngine.observe(
      this,
      (
        table: ModelConstructor<any> | string,
        operation: string,
        id: string
      ) => {
        return (
          operation === OperationKeys.CREATE &&
          id === this.task.id &&
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async track(evt: TaskEventModel, ctx: Context) {
    if (evt.payload.status === TaskStatus.SUCCEEDED)
      this.succeed(evt.payload.output);
    if (evt.payload.status === TaskStatus.FAILED) this.fail(evt.payload.output);
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
