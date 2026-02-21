import { promises as defaultFs } from "node:fs";
import path from "node:path";
import { MultiLock, Lock } from "@decaf-ts/transactional-decorators";
import { ensureDir } from "../helpers";
import { FilesystemLock } from "./FilesystemLock";

export class FilesystemMultiLock extends MultiLock {
  constructor(
    private readonly lockDir: string,
    private readonly fs: typeof defaultFs = defaultFs
  ) {
    super();
  }

  protected override async lockFor(name: string): Promise<Lock> {
    await this.lock.acquire();
    if (!this.locks[name]) {
      const lockPath = path.join(
        this.lockDir,
        `${encodeURIComponent(name)}.lock`
      );
      await ensureDir(this.fs, path.dirname(lockPath));
      this.locks[name] = new FilesystemLock(lockPath, this.fs);
    }
    this.lock.release();
    return this.locks[name];
  }
}
