import { TaskEngineConfig } from "./types";

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
  ALL = "all",
}

export enum TaskType {
  ATOMIC = "atomic",
  COMPOSITE = "composite",
}

export const TasksKey = "tasks";

export const DefaultTaskEngineConfig: TaskEngineConfig<any> = {
  workerId: "default-worker",
  concurrency: 10,
  leaseMs: 60000,
  pollMsIdle: 1000,
  pollMsBusy: 500,
  logTailMax: 100,
  streamBufferSize: 5,
  maxLoggingBuffer: 300,
  loggingBufferTruncation: 20,
  gracefulShutdownMsTimeout: 60 * 2 * 1000,
} as TaskEngineConfig<any>;
