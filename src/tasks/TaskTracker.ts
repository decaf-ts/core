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

  protected pipes?: Record<TaskEventType, Set<EventPipe>>;

  private resolved = false;
  private terminalContext?: Context;
  private lastTerminalPayload?: O | TaskErrorModel;

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
      TaskStatus.WAITING_RETRY,
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

  protected succeed(result: O) {
    this.complete(result);
  }
  protected fail(error: TaskErrorModel) {
    this.complete(error);
  }

  protected cancel(evt: TaskEventModel) {
    if (!evt.payload?.error) return;
    this.fail(evt.payload.error);
  }

  protected retry(evt: TaskEventModel) {
    if (!evt.payload) return;
    if (evt.payload.error) this.task.error = evt.payload.error;
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

  private extractError(evt: TaskEventModel): TaskErrorModel {
    if (evt.payload?.error) return evt.payload.error;
    if (this.task.error) return this.task.error;
    if (this.lastTerminalPayload instanceof TaskErrorModel)
      return this.lastTerminalPayload;
    const status = evt.payload?.status ?? this.task.status;
    const message =
      status === TaskStatus.WAITING_RETRY
        ? `Task ${this.task.id} scheduled for retry`
        : `Task ${this.task.id} ${status}`;
    return new TaskErrorModel({ message });
  }

  private complete(payload: O | TaskErrorModel) {
    if (this.resolved) return;
    this.resolved = true;
    this.unregistration();
    this.pipes = undefined;
    this.lastTerminalPayload = payload;
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
    if (evt.payload.status === TaskStatus.WAITING_RETRY) {
      this.retry(evt);
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
