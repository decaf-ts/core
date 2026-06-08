import { TaskContext } from "./TaskContext";
import { TaskLogger } from "./logging";
import { LogLevel } from "@decaf-ts/logging";
import { Adapter, ContextFlags } from "../persistence/index";
import { ConfOf } from "../persistence/types";
import { TaskEventBus } from "./TaskEventBus";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskStatus } from "./constants";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { TaskStepSpecModel } from "./models/TaskStepSpecModel";

export interface ITaskHandler<I = any, O = any> {
  type: string;
  run(input: I, ctx: TaskContext): Promise<O>;
  catch?(input: I, error: unknown, ctx: TaskContext): Promise<void>;
}

export type TaskDependencySpec = {
  dependencies?: string[];
};

export type LogPipeOptions = {
  style: boolean;
  logProgress: boolean;
  logStatus: boolean;
};

export type EventPipe = (evt: TaskEventModel, ...args: any[]) => Promise<void>;

export interface LogPipe {
  (logs: [LogLevel, string, any][]): Promise<void>;
  (entry: [LogLevel, string] | [LogLevel, string, any]): Promise<void>;
  (level: LogLevel, msg: string, meta?: any): Promise<void>;
}

export interface TaskFlags<LOG extends TaskLogger<any> = TaskLogger<any>>
  extends ContextFlags<LOG> {
  taskId: string;
  attempt: number;
  pipe: LogPipe;
  flush: () => Promise<void>;
  progress: (data: any) => Promise<void>;
  heartbeat: () => Promise<void>;
  scheduleCompositeSteps?: (steps: TaskStepSpecModel[], ctx: TaskContext) => Promise<void>;
  scheduleCompositeStepsAtEnd?: (steps: TaskStepSpecModel[], ctx: TaskContext) => Promise<void>;
  resultCache?: Record<string, any>;
  gracefulShutdownMsTimeout?: number; // to allow selective override
}

export type TaskEngineConfig<A extends Adapter<any, any, any, any>> = {
  adapter: A;
  overrides?: Partial<ConfOf<A>>;
  bus?: TaskEventBus;
  registry?: TaskHandlerRegistry;
  workerId: string;
  concurrency: number;
  leaseMs: number;
  pollMsIdle: number;
  pollMsBusy: number;
  logTailMax: number;
  streamBufferSize: number;
  maxLoggingBuffer: number;
  loggingBufferTruncation: number;
  gracefulShutdownMsTimeout: number;
  autoShutdown?: TaskEngineAutoShutdownConfig;
};

export type TaskProgressPayload = {
  status: TaskStatus | "update";
  currentStep?: number;
  totalSteps?: number;
  output?: any;
  error?: TaskErrorModel;
  nextRunAt?: Date;
  scheduledTo?: Date;
};

export interface TaskEngineAutoShutdownConfig {
  enabled?: boolean;
  backoffStepMs?: number;
  maxIdleDelayMs?: number;
}
