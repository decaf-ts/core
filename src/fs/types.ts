import type { promises as FsPromises } from "node:fs";
import type { RamConfig } from "../ram/types";
import type { JsonSpacing } from "./helpers";

export type FilesystemHydrationInfo = {
  table: string;
  records: number;
};

export type FilesystemConfig = RamConfig & {
  /**
   * Base directory where adapter data is persisted.
   * A sub-directory using the adapter alias will be created automatically.
  */
  rootDir?: string;
  /**
   * Optional fs/promises implementation (for testing/mocking).
   */
  fs?: typeof FsPromises;
  /**
   * Whether JSON files should use pretty formatting.
   */
  jsonSpacing?: JsonSpacing;
  /**
   * Optional callback invoked after a table has been hydrated from disk.
   */
  onHydrated?: (info: FilesystemHydrationInfo) => void;
};
