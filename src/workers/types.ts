import { Worker } from "worker_threads";
import {
  TaskContext,
  TaskModel,
  TaskEngineConfig as TSC,
} from "../tasks/index";

export type TaskWorkerThread = {
  id: string;
  worker: Worker;
  ready: boolean;
  activeJobs: number;
  capacity: number;
  readyPromise?: Promise<void>;
  resolveReady?: () => void;
  rejectReady?: (error: Error) => void;
};

export type WorkerJobState = {
  id: string;
  classification: string;
  input: any;
  task: TaskModel;
  ctx: TaskContext;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  worker?: TaskWorkerThread;
};

import {
  WorkThreadModulesConfig,
  WorkThreadPersistenceConfig,
} from "./WorkThreadEnvironment";
import { Adapter } from "../persistence/index";

export type WorkerAdapterDescriptor = WorkThreadPersistenceConfig;

export type WorkThreadPoolConfig = {
  size?: number;
  mode?: "node" | "browser";
  entry: string;
  modules?: WorkThreadModulesConfig;
};

export type TaskEngineConfig<A extends Adapter<any, any, any, any>> = TSC<A> & {
  workerAdapter?: WorkerAdapterDescriptor;
  workerPool?: WorkThreadPoolConfig;
  workerConcurrency?: number;
};
