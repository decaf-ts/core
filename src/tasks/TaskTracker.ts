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

export class TaskTracker<O = any>
  implements Observer<[TaskEventModel, Context]>
{
  protected unregistration: () => void;

  private resolveResult!: (res: O) => void;
  private rejectResult!: (error: TaskErrorModel) => void;

  protected pipes?: Record<TaskEventType, Set<EventPipe>>;

  private resolved = false;
  private readonly promise: Promise<O>;
  private terminalContext?: Context;

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
      self.resolveResult = resolve;
      self.rejectResult = reject;
    });

    this.pipe(this.track.bind(this));
    this.resolveTerminalState();
  }

  resolve(): Promise<O> {
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

  protected succeed(result: O) {
    this.complete(result, true);
  }
  protected fail(error: TaskErrorModel) {
    this.complete(error, false);
  }

  protected cancel(evt: TaskEventModel) {
    if (!evt.payload?.error) return;
    this.fail(evt.payload.error);
  }

  onSucceed(handler: EventPipe) {
    return this.registerStatusHandler(TaskStatus.SUCCEEDED, handler);
  }

  onFailure(handler: EventPipe) {
    return this.registerStatusHandler(TaskStatus.FAILED, handler);
  }

  onCancel(handler: EventPipe) {
    return this.registerStatusHandler(TaskStatus.CANCELED, handler);
  }

  private complete(payload: O | TaskErrorModel, success: boolean) {
    if (this.resolved) return;
    this.resolved = true;
    this.unregistration();
    this.pipes = undefined;
    if (success) this.resolveResult(payload as O);
    else this.rejectResult(payload as TaskErrorModel);
  }

  protected isTerminalStatus(status: TaskStatus) {
    return [
      TaskStatus.SUCCEEDED,
      TaskStatus.CANCELED,
      TaskStatus.FAILED,
    ].includes(status);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async track(evt: TaskEventModel, ctx: Context) {
    if (!evt.payload) return;
    this.task.status = evt.payload.status;
    if (evt.payload.output !== undefined) this.task.output = evt.payload.output;
    if (evt.payload.error) this.task.error = evt.payload.error;
    if (evt.payload.status === TaskStatus.SUCCEEDED) {
      this.succeed(evt.payload.output as O);
    }
    if (evt.payload.status === TaskStatus.FAILED) {
      this.fail(evt.payload.error!);
    }
    if (evt.payload.status === TaskStatus.CANCELED) {
      this.cancel(evt);
    }
  }

  private registerStatusHandler(
    status: TaskStatus,
    handler: EventPipe
  ): () => void {
    const wrapped: EventPipe = async (evt, ctx) => {
      if (evt.payload?.status !== status) return;
      await handler(evt, ctx);
    };
    this.pipe(wrapped, TaskEventType.STATUS);
    if (this.task.status === status) {
      const terminalEvent = this.buildTerminalEvent(status);
      void wrapped(terminalEvent, this.getTerminalContext());
    }
    return () => {
      this.pipes?.[TaskEventType.STATUS]?.delete(wrapped);
    };
  }

  private getTerminalContext() {
    if (!this.terminalContext) this.terminalContext = new Context();
    return this.terminalContext;
  }

  private buildTerminalEvent(status: TaskStatus) {
    const payload: { status: TaskStatus; output?: O; error?: TaskErrorModel } =
      { status };
    if (status === TaskStatus.SUCCEEDED) {
      payload.output = this.task.output as O;
    }
    if (
      (status === TaskStatus.FAILED || status === TaskStatus.CANCELED) &&
      this.task.error
    ) {
      payload.error = this.task.error;
    }
    return new TaskEventModel({
      classification: TaskEventType.STATUS,
      taskId: this.task.id,
      payload,
    });
  }

  private resolveTerminalState() {
    if (!this.isTerminalStatus(this.task.status)) return;
    if (this.task.status === TaskStatus.SUCCEEDED) {
      this.succeed(this.task.output as O);
      return;
    }
    if (this.task.error) {
      this.fail(this.task.error);
    }
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
