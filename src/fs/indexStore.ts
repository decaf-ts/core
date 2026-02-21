import path from "node:path";
import type { promises as FsPromises } from "node:fs";
import { PrimaryKeyType } from "@decaf-ts/db-decorators";
import { OrderDirection } from "../repository/constants";
import {
  JsonSpacing,
  SerializedId,
  ensureDir,
  readJsonFile,
  serializeId,
  writeJsonAtomic,
} from "./helpers";

export type IndexDescriptor = {
  name: string;
  fileName: string;
  columns: string[];
  directions?: OrderDirection[2];
};

type IndexEntries = Record<string, SerializedId[]>;

type PersistedIndex = IndexDescriptor & {
  entries: IndexEntries;
};

const KEY_SEPARATOR = "::";

export function toIndexFileName(indexName: string): string {
  return encodeURIComponent(indexName).replace(/%/g, "_");
}

export class FsIndexStore {
  private readonly cache = new Map<string, Map<string, PersistedIndex>>();

  constructor(
    private readonly fs: typeof FsPromises,
    private readonly indexDirResolver: (tableName: string) => string,
    private readonly spacing?: JsonSpacing
  ) {}

  async ensure(tableName: string, descriptors: IndexDescriptor[]): Promise<void> {
    if (!descriptors.length) return;
    await ensureDir(this.fs, this.indexDirResolver(tableName));
    if (!this.cache.has(tableName)) this.cache.set(tableName, new Map());
    const tableCache = this.cache.get(tableName)!;
    await Promise.all(
      descriptors.map(async (descriptor) => {
        if (tableCache.has(descriptor.fileName)) return;
        const filePath = this.indexPath(tableName, descriptor.fileName);
        const existing = await readJsonFile<PersistedIndex>(this.fs, filePath);
        const payload: PersistedIndex =
          existing && existing.columns?.length
            ? {
                ...descriptor,
                entries: existing.entries ?? {},
                directions: existing.directions ?? descriptor.directions,
                columns: existing.columns,
              }
            : {
                ...descriptor,
                entries: {},
              };
        tableCache.set(descriptor.fileName, payload);
      })
    );
  }

  async upsert(
    tableName: string,
    descriptors: IndexDescriptor[],
    id: PrimaryKeyType,
    record: Record<string, any>,
    previous?: Record<string, any>
  ): Promise<void> {
    if (!descriptors.length) return;
    await this.ensure(tableName, descriptors);
    const tableCache = this.cache.get(tableName);
    if (!tableCache) return;
    const serializedId = serializeId(id);
    await Promise.all(
      descriptors.map(async (descriptor) => {
        const payload = tableCache.get(descriptor.fileName);
        if (!payload) return;
        if (previous) {
          const prevKey = this.keyForRecord(previous, descriptor.columns);
          if (prevKey) {
            this.removeFromEntries(payload.entries, prevKey, serializedId);
          }
        }
        const nextKey = this.keyForRecord(record, descriptor.columns);
        if (!nextKey) return;
        const bucket = payload.entries[nextKey] ?? [];
        if (
          !bucket.find(
            (entry) =>
              entry.type === serializedId.type && entry.value === serializedId.value
          )
        ) {
          bucket.push(serializedId);
          payload.entries[nextKey] = bucket;
        }
        await this.persist(tableName, payload);
      })
    );
  }

  async remove(
    tableName: string,
    descriptors: IndexDescriptor[],
    id: PrimaryKeyType,
    record?: Record<string, any>
  ): Promise<void> {
    if (!descriptors.length) return;
    await this.ensure(tableName, descriptors);
    const tableCache = this.cache.get(tableName);
    if (!tableCache) return;
    const serializedId = serializeId(id);
    await Promise.all(
      descriptors.map(async (descriptor) => {
        const payload = tableCache.get(descriptor.fileName);
        if (!payload) return;
        let removed = false;
        if (record) {
          const key = this.keyForRecord(record, descriptor.columns);
          if (key) {
            removed = this.removeFromEntries(payload.entries, key, serializedId);
          }
        }
        if (!removed) {
          removed = this.removeFromAll(payload.entries, serializedId);
        }
        if (removed) {
          await this.persist(tableName, payload);
        }
      })
    );
  }

  private removeFromEntries(
    entries: IndexEntries,
    key: string,
    id: SerializedId
  ): boolean {
    const bucket = entries[key];
    if (!bucket) return false;
    const filtered = bucket.filter(
      (entry) => entry.value !== id.value || entry.type !== id.type
    );
    if (filtered.length) {
      entries[key] = filtered;
    } else {
      delete entries[key];
    }
    return filtered.length !== bucket.length;
  }

  private removeFromAll(entries: IndexEntries, id: SerializedId): boolean {
    let removed = false;
    for (const key of Object.keys(entries)) {
      removed = this.removeFromEntries(entries, key, id) || removed;
    }
    return removed;
  }

  private keyForRecord(
    record: Record<string, any>,
    columns: string[]
  ): string | undefined {
    if (!record) return undefined;
    const values: unknown[] = [];
    for (const column of columns) {
      if (!(column in record) || typeof record[column] === "undefined") {
        return undefined;
      }
      values.push(record[column]);
    }
    return values.map(this.normalizeValue).join(KEY_SEPARATOR);
  }

  private normalizeValue(value: unknown): string {
    if (value === null) return "__null__";
    if (value === undefined) return "__undefined__";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  private indexPath(tableName: string, fileName: string): string {
    return path.join(this.indexDirResolver(tableName), `${fileName}.json`);
  }

  private async persist(
    tableName: string,
    payload: PersistedIndex
  ): Promise<void> {
    const filePath = this.indexPath(tableName, payload.fileName);
    await writeJsonAtomic(this.fs, filePath, payload, this.spacing);
  }
}
