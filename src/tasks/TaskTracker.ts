import { Observer } from "../interfaces/Observer";
import { TaskEventModel } from "./models/TaskEventModel";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logger, LogLevel } from "@decaf-ts/logging";
import { TaskEventType, TaskStatus } from "./constants";
import {
  EventPipe,
  LogPipe,
  LogPipeOptions,
  TaskProgressPayload,
} from "./types";
import { getLogPipe } from "./logging";
import { TaskModel } from "./models/TaskModel";
import { Context, EventIds } from "../persistence/index";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskEventBus } from "./TaskEventBus";
import { ContextualArgs } from "../utils/index";
import {
  TaskCancelError,
  TaskControlError,
  TaskFailError,
  TaskNextAction,
  TaskRescheduleError,
  TaskRetryError,
} from "./TaskErrors";

export class TaskTracker<O = any>
  implements Observer<[TaskEventModel, Context]>
{
  protected unregistration: () => void;

  protected pipes?: Record<TaskEventType, Set<EventPipe>>;

  private resolved = false;
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
    this.pipe(this.track.bind(this));
    this.resolveTerminalState();
  }

  resolve(): Promise<O> {
    return this.awaitStatusTerminal([
      TaskStatus.SUCCEEDED,
      TaskStatus.FAILED,
      TaskStatus.CANCELED,
      TaskStatus.SCHEDULED,
    ]);
  }

  wait(): Promise<O> {
    return this.awaitStatusTerminal([
      TaskStatus.SUCCEEDED,
      TaskStatus.FAILED,
      TaskStatus.CANCELED,
    ]);
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

  protected succeed(_result?: O) {
    void _result;
    this.complete();
  }
  protected fail(_error?: TaskControlError) {
    void _error;
    this.complete();
  }

  protected cancel(evt: TaskEventModel) {
    if (!evt.payload) return;
    this.fail();
  }

  protected retry() {
    // intentionally no-op so waits remain active until final status
  }

  protected reschedule() {
    // intentionally no-op so waits remain active until final status
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

  private awaitStatusTerminal(statuses: TaskStatus[]): Promise<O> {
    return new Promise<O>((resolve, reject) => {
      const removers: Array<() => void> = [];
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        for (const remove of removers) {
          remove();
        }
      };
      const handler: EventPipe = async (evt: TaskEventModel) => {
        if (settled) return;
        cleanup();
        try {
          if (evt.payload?.status === TaskStatus.SUCCEEDED) {
            resolve(this.extractOutput(evt));
          } else {
            reject(this.extractError(evt));
          }
        } catch (err) {
          reject(err);
        }
      };
      statuses.forEach((status) => {
        const remove = this.registerStatusHandler(status, handler);
        removers.push(remove);
      });
    });
  }

  private extractOutput(evt: TaskEventModel): O {
    if (evt.payload?.output !== undefined) return evt.payload.output as O;
    return this.task.output as O;
  }

  private extractError(evt: TaskEventModel): Error {
    const status = evt.payload?.status ?? this.task.status;
    const nextAction = this.getNextAction(status);
    const originalError = evt.payload?.originalError;
    if (originalError instanceof Error) {
      return this.assignNextAction(originalError, nextAction);
    }
    const meta = this.buildMeta(status, evt.payload);
    const controlError = this.createTaskControlError(
      status,
      evt.payload?.error ?? this.task.error,
      meta
    );
    return this.assignNextAction(controlError, nextAction);
  }

  private complete() {
    if (this.resolved) return;
    this.resolved = true;
    this.unregistration();
    this.pipes = undefined;
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
    const status = evt.payload.status;
    this.task.status = status;
    if (evt.payload.output !== undefined) this.task.output = evt.payload.output;
    if (evt.payload.error) this.task.error = evt.payload.error;
    if (evt.payload.nextRunAt !== undefined)
      this.task.nextRunAt = evt.payload.nextRunAt;
    if (evt.payload.scheduledTo !== undefined)
      this.task.scheduledTo = evt.payload.scheduledTo;

    if (status === TaskStatus.SUCCEEDED) {
      this.succeed();
      return;
    }
    if (status === TaskStatus.FAILED) {
      this.fail();
    }
    if (status === TaskStatus.CANCELED) {
      this.cancel(evt);
    }
    if (status === TaskStatus.WAITING_RETRY) {
      this.retry();
    }
    if (status === TaskStatus.SCHEDULED) {
      this.reschedule();
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
    const payload: {
      status: TaskStatus;
      output?: O;
      error?: TaskErrorModel;
      nextRunAt?: Date;
      scheduledTo?: Date;
    } = {
      status,
    };
    if (status === TaskStatus.SUCCEEDED) {
      payload.output = this.task.output as O;
    }
    if (
      (status === TaskStatus.FAILED || status === TaskStatus.CANCELED) &&
      this.task.error
    ) {
      payload.error = this.task.error;
    }
    if (this.task.nextRunAt) payload.nextRunAt = this.task.nextRunAt;
    if (this.task.scheduledTo) payload.scheduledTo = this.task.scheduledTo;
    return new TaskEventModel({
      classification: TaskEventType.STATUS,
      taskId: this.task.id,
      payload,
    });
  }

  private createTaskControlError(
    status: TaskStatus,
    error?: TaskErrorModel,
    meta?: Record<string, any>
  ): TaskControlError {
    switch (status) {
      case TaskStatus.FAILED:
        return new TaskFailError(this.task.id, error, meta);
      case TaskStatus.CANCELED:
        return new TaskCancelError(this.task.id, error, meta);
      case TaskStatus.WAITING_RETRY:
        return new TaskRetryError(this.task.id, error, meta);
      case TaskStatus.SCHEDULED:
        return new TaskRescheduleError(this.task.id, error, meta);
      default:
        return new TaskFailError(this.task.id, error, meta);
    }
  }

  private assignNextAction(error: Error, action?: TaskNextAction) {
    if (action) (error as any).nextAction = action;
    return error;
  }

  private getNextAction(status?: TaskStatus): TaskNextAction | undefined {
    switch (status) {
      case TaskStatus.CANCELED:
        return TaskStatus.CANCELED;
      case TaskStatus.WAITING_RETRY:
        return TaskStatus.WAITING_RETRY;
      case TaskStatus.SCHEDULED:
        return TaskStatus.SCHEDULED;
      case TaskStatus.FAILED:
        return TaskStatus.FAILED;
      default:
        return undefined;
    }
  }

  private buildMeta(
    status: TaskStatus,
    payload?: TaskProgressPayload
  ): Record<string, any> | undefined {
    const meta: Record<string, any> = {};
    if (payload?.nextRunAt) meta.nextRunAt = payload.nextRunAt;
    if (payload?.scheduledTo) meta.scheduledTo = payload.scheduledTo;
    if (!Object.keys(meta).length) return undefined;
    return meta;
  }

  private resolveTerminalState() {
    if (!this.isTerminalStatus(this.task.status)) return;
    if (this.task.status === TaskStatus.SUCCEEDED) {
      this.succeed(this.task.output as O);
      return;
    }
    const payload: TaskProgressPayload = {
      status: this.task.status,
      nextRunAt: this.task.nextRunAt,
      scheduledTo: this.task.scheduledTo,
    };
    this.fail(
      this.createTaskControlError(
        this.task.status,
        this.task.error,
        this.buildMeta(this.task.status, payload)
      )
    );
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
