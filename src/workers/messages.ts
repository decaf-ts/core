import { LogLevel } from "@decaf-ts/logging";
import { TaskStateChangeRequest } from "../tasks/TaskStateChangeError";

export type WorkerLogEntry = [LogLevel, string] | [LogLevel, string, any];

export interface WorkerJobPayload {
  jobId: string;
  taskId: string;
  classification: string;
  input: any;
  attempt: number;
  resultCache?: Record<string, any>;
  streamBufferSize: number;
  maxLoggingBuffer: number;
  loggingBufferTruncation: number;
}

export type WorkerToMainMessage =
  | { type: "ready"; workerId: string }
  | { type: "log"; workerId: string; jobId: string; entries: WorkerLogEntry[] }
  | { type: "progress"; workerId: string; jobId: string; payload: any }
  | { type: "heartbeat"; workerId: string; jobId: string }
  | {
      type: "result";
      workerId: string;
      jobId: string;
      status: "success";
      output: any;
      cache?: Record<string, any>;
    }
  | {
      type: "result";
      workerId: string;
      jobId: string;
      status: "error";
      error: { name?: string; message: string; stack?: string };
      cache?: Record<string, any>;
    }
  | {
      type: "result";
      workerId: string;
      jobId: string;
      status: "state-change";
      request: TaskStateChangeRequest;
      cache?: Record<string, any>;
    }
  | { type: "error"; workerId: string; error: string; stack?: string };

export type MainToWorkerMessage =
  | { type: "control"; command: "stop" | "shutdown" }
  | { type: "execute"; job: WorkerJobPayload };
