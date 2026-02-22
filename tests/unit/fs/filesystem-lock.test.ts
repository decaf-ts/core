import { promises as fs } from "node:fs";
import path from "node:path";
import { FilesystemLock } from "../../../src/fs/locks/FilesystemLock";
import { FilesystemMultiLock } from "../../../src/fs/locks/FilesystemMultiLock";
import { createTempFs } from "./tempFs";
import { fileExists } from "../../../src/fs/helpers";

async function waitFor(
  predicate: () => Promise<boolean>,
  options: { interval?: number; timeout?: number } = {}
): Promise<void> {
  const { interval = 25, timeout = 2000 } = options;
  const start = Date.now();
  while (true) {
    if (await predicate()) return;
    if (Date.now() - start > timeout) {
      throw new Error("waitFor timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

describe("FilesystemLock", () => {
  it("serializes acquisitions and removes the lock file", async () => {
    const temp = await createTempFs();
    try {
      const lockPath = path.join(temp.root, "locks", "table.lock");
      const lock1 = new FilesystemLock(lockPath, fs);
      const lock2 = new FilesystemLock(lockPath, fs);

      await lock1.acquire();
      expect(await fileExists(fs, lockPath)).toBe(true);

      let secondResolved = false;
      const secondAcquire = lock2.acquire().then(() => {
        secondResolved = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(secondResolved).toBe(false);

      lock1.release();
      await secondAcquire;
      expect(secondResolved).toBe(true);

      lock2.release();
      await waitFor(async () => !(await fileExists(fs, lockPath)));
    } finally {
      await temp.cleanup();
    }
  });

  it("cleans the lockfile even when the execution throws", async () => {
    const temp = await createTempFs();
    try {
      const lockPath = path.join(temp.root, "locks", "error.lock");
      const lock = new FilesystemLock(lockPath, fs);
      await expect(
        lock.execute(() => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
      await waitFor(async () => !(await fileExists(fs, lockPath)));
    } finally {
      await temp.cleanup();
    }
  });
});

describe("FilesystemMultiLock", () => {
  it("queues acquisitions per name and removes lock files", async () => {
    const temp = await createTempFs();
    try {
      const lockDir = path.join(temp.root, "locks");
      const tableName = "table";
      const lockFile = path.join(
        lockDir,
        `${encodeURIComponent(tableName)}.lock`
      );
      const multiLock = new FilesystemMultiLock(lockDir, fs);

      await multiLock.acquire(tableName);
      expect(await fileExists(fs, lockFile)).toBe(true);

      let secondResolved = false;
      const secondAcquire = multiLock.acquire(tableName).then(() => {
        secondResolved = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(secondResolved).toBe(false);

      await multiLock.release(tableName);
      await secondAcquire;
      expect(secondResolved).toBe(true);

      await multiLock.release(tableName);
      await waitFor(async () => !(await fileExists(fs, lockFile)));
    } finally {
      await temp.cleanup();
    }
  });
});
