import { BaseError } from "@decaf-ts/db-decorators";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskStatus } from "./constants";

/**
 * Represents the next action to take after a task error.
 * Used to identify the appropriate response to task failures.
 */
export type TaskNextAction =
  | TaskStatus.CANCELED
  | TaskStatus.WAITING_RETRY
  | TaskStatus.SCHEDULED
  | TaskStatus.FAILED;

/**
 * Additional properties added to errors from TaskTracker.resolve() and TaskTracker.wait()
 */
export type TaskErrorProps = {
  /** The next action to take in response to this error */
  nextAction: TaskNextAction;
  /** The task ID this error relates to (optional, present on TaskControlError) */
  taskId?: string;
  /** Additional error details (optional, present on TaskControlError) */
  details?: TaskErrorModel;
  /** Additional metadata (optional, present on TaskControlError) */
  meta?: Record<string, any>;
};

/**
 * Generic type that preserves the original error type while adding task-specific properties.
 * Use this to type errors from TaskTracker.resolve() and TaskTracker.wait().
 *
 * The original error is preserved (e.g., ValidationError stays ValidationError),
 * with the nextAction property added to identify the appropriate response:
 * - `TaskStatus.CANCELED`: Task was explicitly canceled
 * - `TaskStatus.SCHEDULED`: Task was rescheduled
 * - `TaskStatus.WAITING_RETRY`: Task is waiting for retry
 * - `TaskStatus.FAILED`: Task has permanently failed
 *
 * @example
 * ```typescript
 * try {
 *   await tracker.resolve();
 * } catch (error: unknown) {
 *   if (isTaskError<ValidationError>(error, ValidationError)) {
 *     // error is typed as TaskErrorFrom<ValidationError>
 *     console.log(error.nextAction); // TaskNextAction
 *     console.log(error.code);       // ValidationError's code property
 *   }
 * }
 * ```
 */
export type TaskErrorFrom<E extends Error> = E & TaskErrorProps;

export function isTaskError<E extends Error = Error>(
  error: unknown,
  ErrorClass?: new (...args: any[]) => E
): error is TaskErrorFrom<E> {
  if (!(error instanceof Error)) return false;
  if (!("nextAction" in error)) return false;
  if (typeof (error as any).nextAction !== "string") return false;
  if (ErrorClass && !(error instanceof ErrorClass)) return false;
  return true;
}

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
