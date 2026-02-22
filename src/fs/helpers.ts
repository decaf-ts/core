import type { Dirent, promises as FsPromises } from "node:fs";
import { PrimaryKeyType } from "@decaf-ts/db-decorators";

export type JsonSpacing = number | string | undefined;

export type SerializedId = {
  type: "string" | "number" | "bigint";
  value: string;
};

export function encodeId(id: PrimaryKeyType): string {
  return encodeURIComponent(String(id));
}

export function serializeId(id: PrimaryKeyType): SerializedId {
  if (typeof id === "number") {
    return { type: "number", value: id.toString() };
  }
  if (typeof id === "bigint") {
    return { type: "bigint", value: id.toString() };
  }
  return { type: "string", value: String(id) };
}

export function deserializeId(id: SerializedId): PrimaryKeyType {
  switch (id.type) {
    case "number":
      return Number(id.value);
    case "bigint":
      return BigInt(id.value);
    default:
      return id.value;
  }
}

export async function ensureDir(
  fs: typeof FsPromises,
  dir: string
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJsonFile<T>(
  fs: typeof FsPromises,
  filePath: string
): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function fileExists(
  fs: typeof FsPromises,
  filePath: string
): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeJsonAtomic(
  fs: typeof FsPromises,
  filePath: string,
  payload: unknown,
  spacing?: JsonSpacing
): Promise<void> {
  const contents = JSON.stringify(payload, null, spacing);
  await atomicWrite(fs, filePath, contents);
}

export async function atomicWrite(
  fs: typeof FsPromises,
  filePath: string,
  contents: string
): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, filePath);
}

export async function removeFile(
  fs: typeof FsPromises,
  filePath: string
): Promise<void> {
  await fs.rm(filePath, { force: true });
}

export async function readDirSafe(
  fs: typeof FsPromises,
  dir: string
): Promise<Dirent[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
