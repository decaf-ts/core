import "../../src/index";
import "../../src/overrides/index";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { MultiLock } from "@decaf-ts/transactional-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { TaskBuilder } from "../../src/tasks/builder";
import { TaskService } from "../../src/tasks/TaskService";
import { FilesystemAdapter } from "../../src/fs";
import { TaskEngine } from "../../src/workers/TaskEngine";
import { TaskServiceConfig } from "../../src/workers/types";
import { encodeId } from "../../src/fs/helpers";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { TaskStatus } from "../../src/tasks/constants";
import { createTempFs, TempFsHandle } from "../unit/fs/tempFs";

import "./fixtures/WorkerThreadTask";

const workerEntry = path.join(__dirname, "../../lib/workers/workerThread.cjs");

describe.skip("Task workers with FilesystemAdapter", () => {
  let tempHandle: TempFsHandle;
  let adapter: FilesystemAdapter;
  let service: TaskService<FilesystemAdapter>;
  let engine: TaskEngine<FilesystemAdapter>;

  beforeEach(async () => {
    tempHandle = await createTempFs();
    adapter = new FilesystemAdapter(
      { rootDir: path.join(tempHandle.root, "main"), user: "test-user" },
      "task-fs"
    );
    service = new TaskService();
    const workerRoot = path.join(tempHandle.root, "worker");
    const config: TaskServiceConfig<FilesystemAdapter> = {
      engine: TaskEngine,
      adapter,
      workerId: "task-worker",
      concurrency: 1,
      leaseMs: 1_000,
      pollMsIdle: 200,
      pollMsBusy: 200,
      logTailMax: 64,
      streamBufferSize: 128,
      maxLoggingBuffer: 512,
      loggingBufferTruncation: 16,
      gracefulShutdownMsTimeout: 2_000,
      workerConcurrency: 1,
      workerAdapter: {
        adapterModule: "@decaf-ts/core/fs",
        adapterClass: "FilesystemAdapter",
        adapterArgs: [
          {
            rootDir: workerRoot,
            lock: new MultiLock(),
          },
        ],
        alias: "worker-fs",
      },
      workerPool: {
        entry: workerEntry,
        size: 1,
      },
    };
    await service.boot(config);
    engine = service.client as unknown as TaskEngine<FilesystemAdapter>;
  });

  afterEach(async () => {
    if (engine) await engine.stop();
    await adapter.shutdown();
    await tempHandle.cleanup();
  });

  it("executes worker tasks while persisting through filesystem", async () => {
    const taskBuilder = new TaskBuilder()
      .setClassification("worker-thread-task")
      .setInput({ value: 7, delayMs: 10 })
      .setMaxAttempts(1);
    const { task, tracker } = await service.push(taskBuilder.build(), true);
    const result = await tracker.wait();
    expect(result).toBe(499500 + 7);

    const tableName = Model.tableName(TaskModel);
    const recordPath = path.join(
      tempHandle.root,
      "main",
      "task-fs",
      tableName,
      `${encodeId(task.id)}.json`
    );
    const persisted = JSON.parse(await fs.readFile(recordPath, "utf8"));
    expect(persisted.record.status).toBe(TaskStatus.SUCCEEDED);
  });
});
