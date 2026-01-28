import { BaseError } from "@decaf-ts/db-decorators";
import { TaskErrorModel } from "./models/TaskErrorModel";

export class TaskControlError extends BaseError {
  readonly taskId: string;
  readonly details?: TaskErrorModel;
  readonly meta?: Record<string, any>;

  constructor(
    name: string,
    taskId: string,
    message: string,
    details?: TaskErrorModel,
    meta?: Record<string, any>,
    code = 500
  ) {
    super(name, message, code);
    this.taskId = taskId;
    this.details = details;
    this.meta = meta;
  }
}

export class TaskFailError extends TaskControlError {
  constructor(
    taskId: string,
    details?: TaskErrorModel,
    meta?: Record<string, any>
  ) {
    const message = details?.message ?? `Task ${taskId} failed`;
    super(TaskFailError.name, taskId, message, details, meta, 500);
  }
}

export class TaskRetryError extends TaskControlError {
  constructor(
    taskId: string,
    details?: TaskErrorModel,
    meta?: Record<string, any>
  ) {
    const nextRunAt =
      meta?.nextRunAt instanceof Date
        ? meta.nextRunAt.toISOString()
        : meta?.nextRunAt;
    const message =
      details?.message ??
      `Task ${taskId} scheduled for retry${nextRunAt ? ` at ${nextRunAt}` : ""}`;
    super(TaskRetryError.name, taskId, message, details, meta, 409);
  }
}

export class TaskCancelError extends TaskControlError {
  constructor(
    taskId: string,
    details?: TaskErrorModel,
    meta?: Record<string, any>
  ) {
    const message = details?.message ?? `Task ${taskId} canceled`;
    super(TaskCancelError.name, taskId, message, details, meta, 400);
  }
}

export class TaskRescheduleError extends TaskControlError {
  constructor(
    taskId: string,
    details?: TaskErrorModel,
    meta?: Record<string, any>
  ) {
    const scheduledTo =
      meta?.scheduledTo instanceof Date
        ? meta.scheduledTo.toISOString()
        : meta?.scheduledTo;
    const message =
      details?.message ??
      `Task ${taskId} rescheduled${scheduledTo ? ` to ${scheduledTo}` : ""}`;
    super(TaskRescheduleError.name, taskId, message, details, meta, 202);
  }
}
