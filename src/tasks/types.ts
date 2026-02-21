import { TaskContext } from "./TaskContext";
import { TaskLogger } from "./logging";
import { LogLevel } from "@decaf-ts/logging";
import { Adapter, ContextFlags, FlagsOf } from "../persistence/index";
import { TaskEventBus } from "./TaskEventBus";
import { TaskHandlerRegistry } from "./TaskHandlerRegistry";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskStatus } from "./constants";
import { TaskErrorModel } from "./models/TaskErrorModel";
import { WorkThreadPersistenceConfig } from "./workers/WorkThreadEnvironment";
import { WorkThreadModulesConfig } from "./workers/WorkThreadEnvironment";

export interface ITaskHandler<I = any, O = any> {
  type: string;
  run(input: I, ctx: TaskContext): Promise<O>;
}

export type LogPipeOptions = {
  style: boolean;
  logProgress: boolean;
  logStatus: boolean;
};

export type EventPipe = (evt: TaskEventModel, ...args: any[]) => Promise<void>;

export type LogPipe = (logs: [LogLevel, string, any][]) => Promise<void>;

export interface TaskFlags<LOG extends TaskLogger<any> = TaskLogger<any>>
  extends ContextFlags<LOG> {
  taskId: string;
  attempt: number;
  pipe: LogPipe;
  flush: () => Promise<void>;
  progress: (data: any) => Promise<void>;
  heartbeat: () => Promise<void>;
  resultCache?: Record<string, any>;
}

export type WorkerAdapterDescriptor = WorkThreadPersistenceConfig;

export type WorkThreadPoolConfig = {
  size?: number;
  mode?: "node" | "browser";
  entry: string;
  modules?: WorkThreadModulesConfig;
};

export type TaskEngineConfig<A extends Adapter<any, any, any, any>> = {
  adapter: A;
  overrides?: Partial<FlagsOf<A>>;
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
  workerAdapter?: WorkerAdapterDescriptor;
  workerPool?: WorkThreadPoolConfig;
  workerConcurrency?: number;
};

export type TaskProgressPayload = {
  status: TaskStatus;
  currentStep?: number;
  totalSteps?: number;
  output?: any;
  error?: TaskErrorModel;
  nextRunAt?: Date;
  scheduledTo?: Date;
};
