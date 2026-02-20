import { LoggedEnvironment } from "@decaf-ts/logging";

type WorkerMode = "node" | "browser";

export interface WorkThreadPersistenceConfig {
  flavour?: string;
  alias?: string;
  adapterConfig?: Record<string, unknown>;
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
  /** Node/browser modules that must be required inside the worker before bootstrapping services. */
  required: string[];
  /** Optional list of dynamic feature modules that can be conditionally loaded. */
  optional?: string[];
}

export interface WorkThreadEnvironmentShape {
  workThread: {
    id?: string;
    mode: WorkerMode;
    persistence: WorkThreadPersistenceConfig;
    taskEngine: WorkThreadTaskEngineConfig;
    modules: WorkThreadModulesConfig;
  };
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

export type WorkThreadEnvironment = {
  workerId: string;
  mode?: string; // "browser" | "node" - is this really necessary?
  persistence: {
    flavour: string;
    alias?: string;
    adapterConfig: any; // adapter config
  };
  engine: any; // task engine config
  modules: string[]; // list of adapter specific modules (everything up to core can be simply imported without issue
};

export const DefaultWorkerThreadEnvironment: WorkThreadEnvironment = {
  workerId: "worker",
  persistence: {
    flavour: "",
    alias: "",
    adapterConfig: {}, // adapter config
  },
  engine: defaultTaskEngineConfig, // task engine config
  modules: [], // list of adapter speci
} as WorkThreadEnvironment; // all other MUST ome from

export const WorkThreadEnvironment = LoggedEnvironment.accumulate(
  DefaultWorkerThreadEnvironment
);
