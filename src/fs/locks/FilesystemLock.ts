import { promises as defaultFs, constants as fsConstants } from "node:fs";
import path from "node:path";
import { Lock } from "@decaf-ts/transactional-decorators";
import { ensureDir } from "../helpers";

const DEFAULT_WAIT_MS = 50;

export class FilesystemLock extends Lock {
  private handle?: Awaited<ReturnType<typeof defaultFs.open>>;

  constructor(
    private readonly lockPath: string,
    private readonly fs: typeof defaultFs = defaultFs,
    private readonly waitMs: number = DEFAULT_WAIT_MS
  ) {
    super();
  }

  private async takeLock(): Promise<void> {
    await ensureDir(this.fs, path.dirname(this.lockPath));
    while (true) {
      try {
        this.handle = await this.fs.open(
          this.lockPath,
          fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR
        );
        return;
      } catch (err: any) {
        if (err?.code === "EEXIST") {
          await new Promise((resolve) => setTimeout(resolve, this.waitMs));
          continue;
        }
        throw err;
      }
    }
  }

  private async releaseLockFile(): Promise<void> {
    if (!this.handle) return;
    try {
      await this.handle.close();
    } catch {
      // ignore errors while closing
    }
    await this.fs.rm(this.lockPath, { force: true });
    this.handle = undefined;
  }

  override async acquire(...args: any[]): Promise<void> {
    await super.acquire(...args);
    await this.takeLock();
  }

  override release(...args: any[]): void {
    void this.releaseLockFile().then(() => super.release(...args));
  }
}
