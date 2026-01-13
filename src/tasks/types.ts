import { TaskContext } from "./TaskContext";
import { ContextFlags } from "@decaf-ts/db-decorators";
import { TaskLogger } from "./logging";
import { LogLevel } from "@decaf-ts/logging";

export interface ITaskHandler<I = any, O = any> {
  type: string;
  run(input: I, ctx: TaskContext): Promise<O>;
}

export type LogPipe = (logs: [LogLevel, string, any][]) => Promise<void>;

export interface TaskFlags<LOG extends TaskLogger<any> = TaskLogger<any>>
  extends ContextFlags<LOG> {
  taskId: string;
  attempt: number;
  pipe: LogPipe;
  flush: () => Promise<void>;
  progress: (data: any) => Promise<void>;
  heartbeat: () => Promise<void>;
}

export type TaskEngineOptions = {
  workerId: string;
  concurrency: number;
  leaseMs: number;
  pollMsIdle: number;
  pollMsBusy: number;
  logTailMax: number;
};
