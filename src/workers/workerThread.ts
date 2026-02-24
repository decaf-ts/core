import "../overrides";
import { parentPort, workerData } from "worker_threads";
import {
  WorkThreadEnvironmentShape,
  WorkThreadEnvironment,
  WorkThreadModulesConfig,
} from "./WorkThreadEnvironment";
import {
  WorkerToMainMessage,
  MainToWorkerMessage,
  WorkerJobPayload,
  WorkerLogEntry,
} from "./messages";
import { normalizeImport } from "../utils";
import { Adapter } from "../persistence";
import {
  serializeError,
  TaskEngine,
  TaskHandlerRegistry,
  TaskLogger,
} from "../tasks";
import { Logging } from "@decaf-ts/logging";
import { TaskStateChangeError } from "../tasks/TaskStateChangeError";
import { TaskContext } from "../tasks/TaskContext";

const initialPort = parentPort;
if (!initialPort) {
  throw new Error("workerThread.ts must be run inside a worker thread");
}
const port = initialPort;

const environment = WorkThreadEnvironment.accumulate(
  workerData.environment as WorkThreadEnvironmentShape
);
const persistence = environment.persistence;
const moduleLoadPromise = loadModules(environment.modules);

async function loadModules(modules: WorkThreadModulesConfig) {
  const imports = modules?.imports ?? [];
  if (!imports.length) {
    throw new Error(
      "Worker modules configuration must include at least one import"
    );
  }
  const loaded: any[] = [];
  for (const specifier of imports) {
    const normalized = await normalizeImport(import(specifier));
    loaded.push(normalized);
  }
  return loaded;
}

async function resolveAdapter(): Promise<Adapter<any, any, any, any>> {
  const loadedModules = await moduleLoadPromise;
  if (!loadedModules.length) {
    throw new Error("Unable to load adapter module for worker");
  }
  if (
    persistence.adapterModule &&
    environment.modules.imports[0] !== persistence.adapterModule
  ) {
    throw new Error(
      `Adapter module mismatch: expected ${persistence.adapterModule} as the first import`
    );
  }
  const adapterExports = loadedModules[0];
  const AdapterCtor = persistence.adapterClass
    ? (adapterExports as any)[persistence.adapterClass]
    : (adapterExports as any).default || adapterExports;
  if (!AdapterCtor) {
    throw new Error(
      `Unable to resolve adapter constructor ${persistence.adapterClass} from ${environment.modules.imports[0]}`
    );
  }
  const instance = new AdapterCtor(...(persistence.adapterArgs || []));
  if (persistence.alias) {
    Adapter.setCurrent(persistence.alias);
  } else if ((instance as any).flavour) {
    Adapter.setCurrent((instance as any).flavour);
  }
  if (typeof (instance as any).initialize === "function") {
    await (instance as any).initialize();
  }
  return instance;
}

let adapterPromise: Promise<Adapter<any, any, any, any>> | undefined;
const registryPromise = moduleLoadPromise.then(() => new TaskHandlerRegistry());

function getAdapter(): Promise<Adapter<any, any, any, any>> {
  if (!adapterPromise) adapterPromise = resolveAdapter();
  return adapterPromise;
}
const workerLogger = Logging.get().for(`TaskWorker:${environment.workerId}`);

function post(message: WorkerToMainMessage) {
  port.postMessage(message);
}

function toLogMessage(
  jobId: string,
  entries: WorkerLogEntry[]
): WorkerToMainMessage {
  return { type: "log", workerId: environment.workerId, jobId, entries };
}

getAdapter()
  .then(() => {
    post({
      type: "ready",
      workerId: environment.workerId,
    });
  })
  .catch((err) => {
    post({
      type: "error",
      workerId: environment.workerId,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

async function runJob(job: WorkerJobPayload) {
  await getAdapter();
  const registry = await registryPromise;
  const handler = registry.get(job.classification);
  if (!handler) {
    throw new Error(
      `No task handler registered for type: ${job.classification}`
    );
  }
  const taskLogger = new TaskLogger(
    workerLogger,
    job.streamBufferSize,
    job.maxLoggingBuffer
  );

  const pipe = async (entries: WorkerLogEntry[]) => {
    if (!entries.length) return;
    post(toLogMessage(job.jobId, entries));
  };
  const ctx = TaskEngine.createTaskContext(undefined, {
    logger: taskLogger,
    taskId: job.taskId,
    attempt: job.attempt,
    pipe: async (entries: WorkerLogEntry[]) => pipe(entries),
    flush: async () => {
      const logs = await taskLogger.flush();
      await pipe(logs as WorkerLogEntry[]);
    },
    progress: async (payload: any) => {
      post({
        type: "progress",
        workerId: environment.workerId,
        jobId: job.jobId,
        payload,
      });
    },
    heartbeat: async () => {
      post({
        type: "heartbeat",
        workerId: environment.workerId,
        jobId: job.jobId,
      });
    },
    resultCache: job.resultCache ?? {},
  }) as TaskContext;

  try {
    const output = await handler.run(job.input, ctx);
    await ctx.flush();
    post({
      type: "result",
      workerId: environment.workerId,
      jobId: job.jobId,
      status: "success",
      output,
      cache: ctx.resultCache ?? {},
    });
  } catch (error: any) {
    await ctx.flush();
    if (error instanceof TaskStateChangeError) {
      post({
        type: "result",
        workerId: environment.workerId,
        jobId: job.jobId,
        status: "state-change",
        request: error.request,
        cache: ctx.resultCache ?? {},
      });
      return;
    }
    const serialized = serializeError(error);
    post({
      type: "result",
      workerId: environment.workerId,
      jobId: job.jobId,
      status: "error",
      error: {
        name:
          error instanceof Error
            ? error.name
            : (serialized as any)?.code || "Error",
        message: serialized?.message ?? String(error),
        stack: serialized?.stack,
      },
      cache: ctx.resultCache ?? {},
    });
  }
}

port.on("message", (message: MainToWorkerMessage) => {
  if (message.type === "control") {
    if (message.command === "stop" || message.command === "shutdown") {
      process.exit(0);
    }
    return;
  }
  if (message.type === "execute") {
    void runJob(message.job).catch((err) => {
      post({
        type: "error",
        workerId: environment.workerId,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
  }
});
