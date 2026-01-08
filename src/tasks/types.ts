import { LogLevel } from "@decaf-ts/logging";
import { TaskContext } from "./TaskContext";
import { AdapterFlags } from "../persistence/index";

export interface ITaskHandler<I = any, O = any> {
  type: string;
  run(input: I, ctx: TaskContext): Promise<O>;
}

export interface ITaskContext extends AdapterFlags {
  taskId: string;
  attempt: number;
  log: (level: LogLevel, msg: string, meta?: any) => Promise<void>;
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
