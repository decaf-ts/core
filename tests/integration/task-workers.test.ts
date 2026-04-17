import { FilesystemAdapter } from "../../src/fs";
import "../../src/index";
import "../../src/overrides/index";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { MultiLock } from "@decaf-ts/transactional-decorators";
import { Model } from "@decaf-ts/decorator-validation";
import { TaskBuilder } from "../../src/tasks/builder";
import { TaskService } from "../../src/tasks/TaskService";
import { TaskEngine } from "../../src/workers/TaskEngine";
import { TaskServiceConfig } from "../../src/workers/types";
import { encodeId } from "../../src/fs/helpers";
import { TaskModel } from "../../src/tasks/models/TaskModel";
import { uses } from "@decaf-ts/decoration";
uses("fs")(TaskModel);
import { TaskStatus } from "../../src/tasks/constants";
import { createTempFs, TempFsHandle } from "../unit/fs/tempFs";

import "./fixtures/WorkerThreadTask";
import { Adapter } from "../../src/index";

const workerEntry = path.join(__dirname, "../../lib/workers/workerThread.cjs");

jest.setTimeout(300000);

describe("Task workers with FilesystemAdapter", () => {
  let tempHandle: TempFsHandle;
  let adapter: FilesystemAdapter;
  let service: TaskService<FilesystemAdapter>;
  let engine: TaskEngine<FilesystemAdapter>;
  let config: TaskServiceConfig<any>;

  beforeAll(async () => {
    tempHandle = await createTempFs();
    adapter = new FilesystemAdapter({
      rootDir: path.join(tempHandle.root, "main"),
      user: "test-user",
    });
    await adapter.initialize();
    service = new TaskService();
    const workerRoot = path.join(tempHandle.root, "worker");
    config = {
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
        alias: "fs",
        modules: {
          imports: [
            `${path.join(__dirname, "fixtures", "WorkerThreadTask.cjs")}`,
          ],
        },
      },
      workerPool: {
        entry: workerEntry,
        size: 1,
      },
    };
  });

  afterAll(async () => {
    if (engine) await engine.stop();
    if (adapter) await adapter.shutdown();
    await tempHandle.cleanup();
  });

  it("verifies the adapter is up", async () => {
    const ad = Adapter.get("fs");
    expect(ad).toBeDefined();
  });

  it("boots the services", async () => {
    await service.boot(config);
    engine = service.client as unknown as TaskEngine<FilesystemAdapter>;
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
      "fs",
      tableName,
      `${encodeId(task.id)}.json`
    );
    const persisted = JSON.parse(await fs.readFile(recordPath, "utf8"));
    expect(persisted.record.status).toBe(TaskStatus.SUCCEEDED);
  });
});
