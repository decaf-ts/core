import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export type TempFsHandle = {
  root: string;
  cleanup: () => Promise<void>;
};

export async function createTempFs(
  prefix = "decaf-fs-tests-"
): Promise<TempFsHandle> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    root,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
