export enum TaskStatus {
  PENDING = "pending",
  RUNNING = "running",
  FAILED = "failed",
  SUCCEEDED = "succeeded",
  CANCELED = "canceled",
  WAITING_RETRY = "waiting_retry",
}

export enum BackoffStrategy {
  EXPONENTIAL = "exponential",
  FIXED = "fixed",
}

export enum JitterStrategy {
  NONE = "none",
  FULL = "full",
}

export enum TaskEventType {
  STATUS = "status",
  LOG = "log",
  PROGRESS = "progress",
}

export enum TaskType {
  ATOMIC = "atomic",
  COMPOSITE = "composite",
}

export const TasksKey = "tasks";
