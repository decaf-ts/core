import { promises as defaultFs, watch as fsWatch, FSWatcher } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Constructor } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { PrimaryKeyType } from "@decaf-ts/db-decorators";
import { MultiLock } from "@decaf-ts/transactional-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { ContextualArgs } from "../utils/ContextualLoggedClass";
import { RamAdapter } from "../ram";
import type { RamContext, RawRamQuery } from "../ram/types";
import type { IndexMetadata } from "../repository/types";
import {
  JsonSpacing,
  SerializedId,
  deserializeId,
  encodeId,
  ensureDir,
  readDirSafe,
  readJsonFile,
  removeFile,
  serializeId,
  writeJsonAtomic,
  fileExists,
} from "./helpers";
import { FilesystemMultiLock } from "./locks/FilesystemMultiLock";
import { FsDispatch } from "./FsDispatch";
import { FsIndexStore, IndexDescriptor, toIndexFileName } from "./indexStore";
import type { FilesystemConfig, FilesystemHydrationInfo } from "./types";

type StoredRecord = {
  id: SerializedId;
  record: Record<string, any>;
};

export class FilesystemAdapter extends RamAdapter {
  private readonly rootDir: string;
  private readonly dbPath: string;
  private readonly fs: typeof defaultFs;
  private readonly ready: Promise<void>;
  private readonly jsonSpacing?: JsonSpacing;
  private readonly onHydrated?: (info: FilesystemHydrationInfo) => void;
  private readonly indexStore: FsIndexStore;
  private readonly pkColumnCache = new WeakMap<Constructor<Model>, string>();
  private readonly indexDescriptorCache = new WeakMap<
    Constructor<Model>,
    IndexDescriptor[]
  >();
  private readonly tableWatchers = new Map<string, FSWatcher>();
  private rootWatcher?: FSWatcher;
  private watching = false;

  constructor(
    conf: FilesystemConfig = { lock: new MultiLock() } as FilesystemConfig,
    alias: string = "fs"
  ) {
    const fsImpl = conf.fs ?? defaultFs;
    const aliasName = alias || "fs";
    const rootDir = conf.rootDir ?? path.join(tmpdir(), "decaf-fs-adapter");
    const dbPath = path.join(rootDir, aliasName);
    const lockDir = conf.lockDir ?? path.join(dbPath, "locks");
    const lock =
      conf.lock ??
      new FilesystemMultiLock(lockDir, fsImpl);
    const normalizedConfig: FilesystemConfig = Object.assign({}, conf, {
      fs: fsImpl,
      rootDir,
      lockDir,
      lock,
    });
    super(normalizedConfig, alias);
    this.fs = fsImpl;
    this.jsonSpacing = conf.jsonSpacing;
    this.onHydrated = conf.onHydrated;
    this.rootDir = rootDir;
    this.dbPath = dbPath;
    this.indexStore = new FsIndexStore(
      this.fs,
      (tableName) => this.indexesPath(tableName),
      this.jsonSpacing
    );
    this.ready = this.initializeFromDisk();
  }

  public getFs(): typeof defaultFs {
    return this.fs;
  }

  public getStoragePath(): string {
    return this.dbPath;
  }

  public getTablePath(tableName: string): string {
    return this.tablePath(tableName);
  }

  public getIndexesPath(tableName: string): string {
    return this.indexesPath(tableName);
  }

  protected override Dispatch(): Dispatch<FilesystemAdapter> {
    return new FsDispatch();
  }

  private async initializeFromDisk(): Promise<void> {
    await ensureDir(this.fs, this.dbPath);
    const tables = await readDirSafe(this.fs, this.dbPath);
    for (const entry of tables) {
      if (!entry.isDirectory()) continue;
      const tableName = entry.name;
      const tableDir = path.join(this.dbPath, tableName);
      const map = this.client.get(tableName) ?? new Map();
      this.client.set(tableName, map);
      const rows = await readDirSafe(this.fs, tableDir);
      let hydrated = 0;
      for (const row of rows) {
        if (row.isDirectory()) continue;
        if (!row.name.endsWith(".json")) continue;
        const payload = await readJsonFile<StoredRecord>(
          this.fs,
          path.join(tableDir, row.name)
        );
        if (!payload) continue;
        map.set(deserializeId(payload.id), payload.record);
        hydrated += 1;
      }
      if (hydrated) {
        this.onHydrated?.({ table: tableName, records: hydrated });
      }
    }
  }

  public async ensureWatching(): Promise<void> {
    if (this.watching) return;
    await this.ensureReady();
    this.watching = true;
    this.startRootWatcher();
    const tables = await readDirSafe(this.fs, this.dbPath);
    for (const entry of tables) {
      if (!entry.isDirectory()) continue;
      await this.watchTable(entry.name);
    }
  }

  public stopWatching(): void {
    if (!this.watching) return;
    this.watching = false;
    this.rootWatcher?.close();
    this.rootWatcher = undefined;
    for (const watcher of this.tableWatchers.values()) {
      watcher.close();
    }
    this.tableWatchers.clear();
  }

  private async ensureReady() {
    await this.ready;
  }

  private startRootWatcher(): void {
    if (this.rootWatcher) return;
    this.rootWatcher = fsWatch(
      this.dbPath,
      { persistent: false },
      (event, filename) => void this.handleRootEvent(event, filename)
    );
    this.rootWatcher.on("error", (error) =>
      this.log.for(this.startRootWatcher).error(
        `Filesystem root watcher error: ${error}`
      )
    );
  }

  private async handleRootEvent(
    event: string,
    filename?: string | Buffer
  ): Promise<void> {
    if (event !== "rename") return;
    const tableName = this.normalizeFilename(filename);
    if (!tableName) return;
    const tableDir = this.tablePath(tableName);
    if (await this.directoryExists(tableDir)) {
      await this.watchTable(tableName);
    } else {
      this.unwatchTable(tableName);
    }
  }

  private normalizeFilename(filename?: string | Buffer): string | undefined {
    if (!filename) return undefined;
    return typeof filename === "string"
      ? filename
      : filename.toString("utf8");
  }

  private async watchTable(tableName: string): Promise<void> {
    if (!this.watching) return;
    if (this.tableWatchers.has(tableName)) return;
    const tableDir = this.tablePath(tableName);
    if (!(await this.directoryExists(tableDir))) return;
    const watcher = fsWatch(
      tableDir,
      { persistent: false },
      (event, filename) => void this.handleTableEvent(tableName, event, filename)
    );
    watcher.on("error", (error) =>
      this.log.for(this.watchTable).error(
        `Watcher error for ${tableName}: ${error}`
      )
    );
    this.tableWatchers.set(tableName, watcher);
  }

  private unwatchTable(tableName: string): void {
    const watcher = this.tableWatchers.get(tableName);
    if (watcher) {
      watcher.close();
      this.tableWatchers.delete(tableName);
    }
    this.client.delete(tableName);
  }

  private async handleTableEvent(
    tableName: string,
    event: string,
    filename?: string | Buffer
  ): Promise<void> {
    const fileName = this.normalizeFilename(filename);
    if (!fileName || !fileName.endsWith(".json")) return;
    if (fileName === "indexes" || fileName.startsWith("indexes")) return;
    const targetPath = path.join(this.tablePath(tableName), fileName);
    if (!(await fileExists(this.fs, targetPath))) {
      this.removeRecordFromMap(tableName, fileName);
      return;
    }
    const payload = await readJsonFile<StoredRecord>(this.fs, targetPath);
    if (!payload) return;
    this.applyRecord(tableName, payload);
  }

  private removeRecordFromMap(tableName: string, fileName: string): void {
    const table = this.client.get(tableName);
    if (!table) return;
    const encoded = fileName.replace(/\.json$/, "");
    for (const key of table.keys()) {
      if (encodeId(key as PrimaryKeyType) === encoded) {
        table.delete(key);
        break;
      }
    }
  }

  private applyRecord(tableName: string, payload: StoredRecord): void {
    const map = this.client.get(tableName) ?? new Map();
    map.set(deserializeId(payload.id), payload.record);
    this.client.set(tableName, map);
  }

  private async hydrateTable(tableName: string): Promise<void> {
    const tableDir = this.tablePath(tableName);
    if (!(await this.directoryExists(tableDir))) return;
    const map = new Map<PrimaryKeyType, Record<string, any>>();
    const rows = await readDirSafe(this.fs, tableDir);
    for (const row of rows) {
      if (row.isDirectory()) continue;
      if (!row.name.endsWith(".json")) continue;
      const payload = await readJsonFile<StoredRecord>(
        this.fs,
        path.join(tableDir, row.name)
      );
      if (!payload) continue;
      map.set(deserializeId(payload.id), payload.record);
    }
    this.client.set(tableName, map);
  }

  private async directoryExists(dir: string): Promise<boolean> {
    try {
      const stats = await this.fs.stat(dir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private tablePath(tableName: string) {
    return path.join(this.dbPath, tableName);
  }

  private recordPath(tableName: string, id: PrimaryKeyType) {
    return path.join(this.tablePath(tableName), `${encodeId(id)}.json`);
  }

  private indexesPath(tableName: string) {
    return path.join(this.tablePath(tableName), "indexes");
  }

  private async writeRecord(
    tableName: string,
    id: PrimaryKeyType,
    record: Record<string, any>
  ) {
    const tableDir = this.tablePath(tableName);
    await ensureDir(this.fs, tableDir);
    await ensureDir(this.fs, this.indexesPath(tableName));
    const payload: StoredRecord = {
      id: serializeId(id),
      record,
    };
    const filePath = this.recordPath(tableName, id);
    await writeJsonAtomic(this.fs, filePath, payload, this.jsonSpacing);
  }

  private async removeRecord(tableName: string, id: PrimaryKeyType) {
    const filePath = this.recordPath(tableName, id);
    await removeFile(this.fs, filePath);
  }

  private async syncIndexesForWrite<M extends Model>(
    clazz: Constructor<M>,
    tableName: string,
    id: PrimaryKeyType,
    record: Record<string, any>,
    previous?: Record<string, any>
  ) {
    const descriptors = this.getIndexDescriptors(clazz);
    if (!descriptors.length) return;
    await this.indexStore.upsert(
      tableName,
      descriptors,
      id,
      this.buildIndexSource(clazz, record, id),
      previous ? this.buildIndexSource(clazz, previous, id) : undefined
    );
  }

  private async removeIndexesForRecord<M extends Model>(
    clazz: Constructor<M>,
    tableName: string,
    id: PrimaryKeyType,
    record?: Record<string, any>
  ) {
    const descriptors = this.getIndexDescriptors(clazz);
    if (!descriptors.length) return;
    await this.indexStore.remove(
      tableName,
      descriptors,
      id,
      record ? this.buildIndexSource(clazz, record, id) : undefined
    );
  }

  private getIndexDescriptors<M extends Model>(
    clazz: Constructor<M>
  ): IndexDescriptor[] {
    const cached = this.indexDescriptorCache.get(clazz as Constructor<Model>);
    if (cached) return cached;
    const indexes = Model.indexes(clazz) || {};
    const tableName = Model.tableName(clazz);
    const descriptors: IndexDescriptor[] = [];
    Object.entries(indexes).forEach(([property, metadata]) => {
      const rawMeta = metadata?.[PersistenceKeys.INDEX] as
        | Record<string, any>
        | undefined;
      if (!rawMeta) return;
      const flattened = this.collectIndexMetadata(property, rawMeta);
      flattened.forEach(({ property: targetProp, meta }) => {
        const columns = this.buildColumns(clazz, targetProp, meta.compositions);
        const baseName =
          meta.name ||
          [tableName, targetProp, ...(meta.compositions ?? [])].join("_");
        descriptors.push({
          name: baseName,
          fileName: toIndexFileName(baseName),
          columns,
          directions: meta.directions,
        });
      });
    });
    this.indexDescriptorCache.set(clazz as Constructor<Model>, descriptors);
    return descriptors;
  }

  private collectIndexMetadata(
    property: string,
    raw?: Record<string, any>
  ): Array<{ property: string; meta: IndexMetadata }> {
    if (!raw) return [];
    const entries: Array<{ property: string; meta: IndexMetadata }> = [];
    const directMeta = this.asIndexMetadata(raw);
    if (directMeta) {
      entries.push({ property, meta: directMeta });
    }
    Object.entries(raw).forEach(([key, value]) => {
      if (
        ["directions", "compositions", "name"].includes(key) ||
        value === undefined ||
        value === null
      ) {
        return;
      }
      if (typeof value === "object") {
        entries.push(
          ...this.collectIndexMetadata(key, value as Record<string, any>)
        );
      }
    });
    return entries;
  }

  private asIndexMetadata(raw: Record<string, any>): IndexMetadata | undefined {
    const hasMeta =
      Object.prototype.hasOwnProperty.call(raw, "directions") ||
      Object.prototype.hasOwnProperty.call(raw, "compositions") ||
      Object.prototype.hasOwnProperty.call(raw, "name");
    if (!hasMeta) return undefined;
    const { directions, compositions, name } = raw;
    return {
      directions: directions as IndexMetadata["directions"],
      compositions: compositions as IndexMetadata["compositions"],
      name: name as IndexMetadata["name"],
    };
  }

  private buildColumns<M extends Model>(
    clazz: Constructor<M>,
    property: string,
    compositions?: readonly string[]
  ): string[] {
    const main = this.columnNameOrFallback<M>(clazz, property);
    const extras = (compositions ?? []).map((comp) =>
      this.columnNameOrFallback<M>(clazz, comp)
    );
    return [main, ...extras];
  }

  private columnNameOrFallback<M extends Model>(
    clazz: Constructor<M>,
    property: string
  ): string {
    try {
      return Model.columnName(clazz, property as keyof M);
    } catch {
      return property;
    }
  }

  private getPkColumn<M extends Model>(clazz: Constructor<M>): string {
    const cached = this.pkColumnCache.get(clazz as Constructor<Model>);
    if (cached) return cached;
    const pkProp = Model.pk(clazz) as keyof M;
    const column = this.columnNameOrFallback<M>(clazz, String(pkProp));
    this.pkColumnCache.set(clazz as Constructor<Model>, column);
    return column;
  }

  private buildIndexSource<M extends Model>(
    clazz: Constructor<M>,
    record: Record<string, any>,
    id: PrimaryKeyType
  ): Record<string, any> {
    const pkColumn = this.getPkColumn(clazz);
    if (!pkColumn || pkColumn in record) return record;
    return Object.assign({}, record, { [pkColumn]: id });
  }

  override async create<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    await this.ensureReady();
    const tableName = Model.tableName(clazz);
    const record = await super.create(clazz, id, model, ...args);
    await this.writeRecord(tableName, id, record);
    await this.syncIndexesForWrite(clazz, tableName, id, record);
    return record;
  }

  override async read<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    await this.ensureReady();
    return super.read(clazz, id, ...args);
  }

  override async update<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    model: Record<string, any>,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    await this.ensureReady();
    const tableName = Model.tableName(clazz);
    const previous = this.client.get(tableName)?.get(id as any);
    const record = await super.update(clazz, id, model, ...args);
    await this.writeRecord(tableName, id, record);
    await this.syncIndexesForWrite(clazz, tableName, id, record, previous);
    return record;
  }

  override async delete<M extends Model>(
    clazz: Constructor<M>,
    id: PrimaryKeyType,
    ...args: ContextualArgs<RamContext>
  ): Promise<Record<string, any>> {
    await this.ensureReady();
    const tableName = Model.tableName(clazz);
    const record = await super.delete(clazz, id, ...args);
    await this.removeRecord(tableName, id);
    await this.removeIndexesForRecord(clazz, tableName, id, record);
    return record;
  }

  override async raw<R, D extends boolean>(
    rawInput: RawRamQuery<any>,
    docsOnly: D = true as D,
    ...args: ContextualArgs<RamContext>
  ) {
    await this.ensureReady();
    return super.raw<R, D>(rawInput, docsOnly, ...args);
  }
}
