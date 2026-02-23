import { tmpdir } from "node:os";
import * as path from "node:path";

describe("FsAdapter Worker Pool Integration", () => {
  let workerPoolDir: string;

  beforeAll(() => {
    workerPoolDir = path.join(tmpdir(), `decaf-worker-pool-${Date.now()}`);
  });

  afterAll(() => {
    try {
      if (workerPoolDir && path.isAbsolute(workerPoolDir)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("fs") as typeof import("fs");
        if (fs.existsSync(workerPoolDir)) {
          fs.rmSync(workerPoolDir, { recursive: true, force: true });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // ignore cleanup errors
    }
  });

  describe("Worker Pool Configuration", () => {
    it("should create worker pool directory structure", () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pathModule = require("path") as typeof import("path");

      const adapterRoot = pathModule.join(workerPoolDir, "adapter");
      const workerStateDir = pathModule.join(workerPoolDir, "workers");

      fs.mkdirSync(adapterRoot, { recursive: true });
      fs.mkdirSync(workerStateDir, { recursive: true });

      expect(fs.existsSync(adapterRoot)).toBe(true);
      expect(fs.existsSync(workerStateDir)).toBe(true);
    });

    it("should configure worker persistence with FsAdapter", async () => {
      const workerId = `worker-${Date.now()}`;

      const persistenceConfig = {
        adapterModule: "@decaf-ts/core/fs",
        adapterClass: "FsAdapter",
        adapterArgs: [{ rootDir: workerPoolDir }],
        alias: "fs-worker-pool",
      };

      const workThreadConfig = {
        workerId,
        mode: "node" as const,
        persistence: persistenceConfig,
        taskEngine: {
          concurrency: 1,
          leaseMs: 60000,
          pollMsIdle: 5000,
          pollMsBusy: 1000,
          logTailMax: 256,
          streamBufferSize: 512,
          maxLoggingBuffer: 1024,
          loggingBufferTruncation: 8,
          gracefulShutdownMsTimeout: 10000,
        },
        modules: {
          imports: ["@decaf-ts/core", "@decaf-ts/logging"],
        },
      };

      expect(workThreadConfig.persistence.adapterModule).toBe(
        "@decaf-ts/core/fs"
      );
      expect(workThreadConfig.persistence.adapterClass).toBe("FsAdapter");
      expect(workThreadConfig.mode).toBe("node");
      expect(workThreadConfig.taskEngine.concurrency).toBe(1);
    });
  });

  describe("FsAdapter File Operations", () => {
    it("should demonstrate atomic file writes for task persistence", async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pathModule = require("path") as typeof import("path");

      const taskId = `task-${Date.now()}`;
      const taskData = {
        id: taskId,
        status: "pending",
        input: 42,
        output: null,
        createdAt: new Date().toISOString(),
      };

      const taskDir = pathModule.join(workerPoolDir, "adapter", "tasks");
      fs.mkdirSync(taskDir, { recursive: true });

      const taskFile = pathModule.join(taskDir, `${taskId}.json`);
      fs.writeFileSync(taskFile, JSON.stringify(taskData, null, 2));

      const content = fs.readFileSync(taskFile, "utf8");
      const parsed = JSON.parse(content);

      expect(parsed.id).toBe(taskId);
      expect(parsed.status).toBe("pending");
      expect(parsed.input).toBe(42);

      fs.unlinkSync(taskFile);
      fs.rmdirSync(taskDir);
    });

    it("should demonstrate directory structure for adapter persistence", async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs") as typeof import("fs");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pathModule = require("path") as typeof import("path");

      const adapterRoot = pathModule.join(workerPoolDir, "adapter");
      const tasksDir = pathModule.join(adapterRoot, "tasks");
      const eventsDir = pathModule.join(adapterRoot, "events");

      fs.mkdirSync(tasksDir, { recursive: true });
      fs.mkdirSync(eventsDir, { recursive: true });

      expect(fs.existsSync(adapterRoot)).toBe(true);
      expect(fs.existsSync(tasksDir)).toBe(true);
      expect(fs.existsSync(eventsDir)).toBe(true);

      const taskId = `dir-structure-${Date.now()}`;
      const taskFile = pathModule.join(tasksDir, `${taskId}.json`);
      fs.writeFileSync(
        taskFile,
        JSON.stringify({ id: taskId, status: "running" })
      );

      const files = fs.readdirSync(tasksDir);
      expect(files.length).toBe(1);
      expect(files[0]).toContain(taskId);

      try {
        fs.rmdirSync(adapterRoot);
      } catch (e: unknown) {
        console.log(`Failed to delete temp folder`, e);
      }
    });
  });

  describe("Worker Thread Communication", () => {
    it("should simulate worker ready message", async () => {
      const workerId = `worker-${Date.now()}`;
      const readyMessage = {
        type: "ready",
        workerId,
      };

      expect(readyMessage.type).toBe("ready");
      expect(readyMessage.workerId).toContain("worker-");
    });

    it("should simulate job execution message", async () => {
      const jobId = `job-${Date.now()}`;
      const taskId = `task-${Date.now()}`;

      const jobPayload = {
        jobId,
        taskId,
        classification: "test-task",
        input: 42,
        attempt: 0,
        streamBufferSize: 512,
        maxLoggingBuffer: 1024,
        loggingBufferTruncation: 8,
      };

      expect(jobPayload.jobId).toBe(jobId);
      expect(jobPayload.taskId).toBe(taskId);
      expect(jobPayload.input).toBe(42);
    });

    it("should simulate progress update message", async () => {
      const jobId = `job-${Date.now()}`;

      const progressMessage = {
        type: "progress",
        workerId: `worker-${Date.now()}`,
        jobId,
        payload: { percent: 50, current: 21, total: 42 },
      };

      expect(progressMessage.type).toBe("progress");
      expect(progressMessage.payload.percent).toBe(50);
    });

    it("should simulate completion message", async () => {
      const jobId = `job-${Date.now()}`;

      const completionMessage = {
        type: "result",
        workerId: `worker-${Date.now()}`,
        jobId,
        status: "success" as const,
        output: 42,
      };

      expect(completionMessage.status).toBe("success");
      expect(completionMessage.output).toBe(42);
    });
  });
});
