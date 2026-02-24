import { LoggedEnvironment, isBrowser } from "@decaf-ts/logging";

type WorkerMode = "node" | "browser";

export interface WorkThreadPersistenceConfig {
  adapterModule: string;
  adapterClass?: string;
  adapterArgs?: any[];
  flavour?: string;
  alias?: string;
  modules?: WorkThreadModulesConfig;
}

export interface WorkThreadTaskEngineConfig {
  concurrency: number;
  leaseMs: number;
  pollMsIdle: number;
  pollMsBusy: number;
  logTailMax: number;
  streamBufferSize: number;
  maxLoggingBuffer: number;
  loggingBufferTruncation: number;
  gracefulShutdownMsTimeout: number;
}

export interface WorkThreadModulesConfig {
  imports: string[];
}

export interface WorkThreadEnvironmentShape {
  workerId: string;
  mode: WorkerMode;
  persistence: WorkThreadPersistenceConfig;
  taskEngine: WorkThreadTaskEngineConfig;
  modules: WorkThreadModulesConfig;
}

const defaultTaskEngineConfig: WorkThreadTaskEngineConfig = {
  concurrency: 1,
  leaseMs: 60_000,
  pollMsIdle: 5_000,
  pollMsBusy: 1_000,
  logTailMax: 256,
  streamBufferSize: 512,
  maxLoggingBuffer: 1_024,
  loggingBufferTruncation: 8,
  gracefulShutdownMsTimeout: 10_000,
};

const defaultModules: WorkThreadModulesConfig = {
  imports: ["@decaf-ts/core", "@decaf-ts/logging"],
};

export const DefaultWorkThreadEnvironment: WorkThreadEnvironmentShape = {
  workerId: "worker",
  mode: isBrowser() ? "browser" : "node",
  persistence: {
    adapterModule: "@decaf-ts/core/fs",
    adapterClass: "FsAdapter",
    adapterArgs: [],
  },
  taskEngine: defaultTaskEngineConfig,
  modules: defaultModules,
};

export const WorkThreadEnvironment = LoggedEnvironment.accumulate(
  DefaultWorkThreadEnvironment
);
