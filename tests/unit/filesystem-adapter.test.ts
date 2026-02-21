import "../../src/overrides";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Constructor, DefaultFlavour, uses } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { FilesystemAdapter, toIndexFileName } from "../../src/fs";
import type { FilesystemConfig } from "../../src/fs";
import { Adapter } from "../../src/persistence";
import { Repository } from "../../src/repository/Repository";
import { TempFsHandle, createTempFs } from "./fs/tempFs";
import { IndexedFsModel } from "./fs/models/IndexedFsModel";
import { FsTestModel } from "./fs/models/FsTestModel";

const DefaultSeparator = "_";

describe("FilesystemAdapter", () => {
  let tempHandle: TempFsHandle;
  const activeAdapters: FilesystemAdapter[] = [];
  const usedAliases = new Set<string>();

  beforeAll(async () => {
    tempHandle = await createTempFs();
  });

  afterEach(async () => {
    while (activeAdapters.length) {
      const adapter = activeAdapters.pop();
      if (adapter) await releaseAdapter(adapter);
    }
    for (const alias of usedAliases) {
      clearRepositoryCache(FsTestModel, alias);
      clearRepositoryCache(IndexedFsModel, alias);
    }
    usedAliases.clear();
    resetModelFlavour(FsTestModel);
    resetModelFlavour(IndexedFsModel);
  });

  afterAll(async () => {
    await tempHandle.cleanup();
  });

  const createAdapter = (alias: string, extra?: Partial<FilesystemConfig>) => {
    const adapter = new FilesystemAdapter(
      { user: "tester", rootDir: tempHandle.root, ...(extra || {}) },
      alias
    );
    activeAdapters.push(adapter);
    usedAliases.add(alias);
    return adapter;
  };

  const forgetAdapter = (adapter: FilesystemAdapter) => {
    const idx = activeAdapters.indexOf(adapter);
    if (idx >= 0) activeAdapters.splice(idx, 1);
  };

  const releaseAdapter = async (adapter: FilesystemAdapter) => {
    await adapter.shutdown();
    delete (Adapter as any)._cache?.[adapter.alias];
  };

  const recordPath = (alias: string, id: string) =>
    path.join(
      tempHandle.root,
      alias,
      Model.tableName(FsTestModel),
      `${encodeURIComponent(id)}.json`
    );

  const cleanupAlias = async (alias: string) => {
    await fs.rm(path.join(tempHandle.root, alias), {
      recursive: true,
      force: true,
    });
  };

  const clearRepositoryCache = (
    clazz: Constructor<Model>,
    alias: string
  ): void => {
    const tableName = Model.tableName(clazz);
    const cache = (Repository as any)._cache;
    if (!cache) return;
    Object.keys(cache).forEach((key) => {
      const matchesAlias =
        key === tableName ||
        key.startsWith(`${tableName}${DefaultSeparator}`) ||
        key.includes(alias);
      if (matchesAlias) {
        delete cache[key];
      }
    });
  };

  const resetModelFlavour = (clazz: Constructor<Model>) => {
    uses(DefaultFlavour)(clazz);
  };

  it("persists records between adapter instances", async () => {
    const alias = `fs-adapter-${Date.now()}`;
    try {
      const adapter1 = createAdapter(alias);
      const repo1 = new Repository(adapter1, FsTestModel);

      const created = await repo1.create(
        new FsTestModel({
          id: "user-1",
          name: "Persisted User",
          nif: "123456789",
        })
      );

      const storedFile = await fs.readFile(
        recordPath(alias, created.id),
        "utf8"
      );
      const parsed = JSON.parse(storedFile);
      expect(parsed.record.fs_name).toBe("Persisted User");

      forgetAdapter(adapter1);
      await releaseAdapter(adapter1);
      clearRepositoryCache(FsTestModel, alias);

      const adapter2 = createAdapter(alias);
      const repo2 = new Repository(adapter2, FsTestModel);
      const read = await repo2.read(created.id);
      expect(read.name).toBe("Persisted User");
    } finally {
      await cleanupAlias(alias);
    }
  });

  it("updates and deletes records across restarts", async () => {
    const alias = `fs-adapter-${Date.now()}-updates`;
    try {
      const adapter = createAdapter(alias);
      const repo = new Repository(adapter, FsTestModel);
      const created = await repo.create(
        new FsTestModel({
          id: "user-2",
          name: "Original",
          nif: "987654321",
        })
      );

      await repo.update(
        new FsTestModel({
          ...created,
          name: "Updated Name",
        })
      );

      forgetAdapter(adapter);
      await releaseAdapter(adapter);
      clearRepositoryCache(FsTestModel, alias);

      const reloaded = createAdapter(alias);
      const repoReloaded = new Repository(reloaded, FsTestModel);
      const updated = await repoReloaded.read(created.id);
      expect(updated.name).toBe("Updated Name");

      await repoReloaded.delete(created.id);
      await expect(repoReloaded.read(created.id)).rejects.toThrow();
    } finally {
      await cleanupAlias(alias);
    }
  });

  it("writes and updates index files for indexed models", async () => {
    const alias = `fs-adapter-${Date.now()}-indexes`;
    try {
      const adapter = createAdapter(alias);
      const repo = new Repository(adapter, IndexedFsModel);
      const created = await repo.create(
        new IndexedFsModel({
          id: "idx-1",
          name: "Indexed User",
          category: "initial",
        })
      );

      const tableName = Model.tableName(IndexedFsModel);
      const indexFile = path.join(
        tempHandle.root,
        alias,
        tableName,
        "indexes",
        `${toIndexFileName("category_name_index")}.json`
      );

      const firstIndex = JSON.parse(await fs.readFile(indexFile, "utf8"));
      expect(firstIndex.entries["initial::Indexed User"]).toBeDefined();
      expect(firstIndex.entries["initial::Indexed User"][0].value).toBe(
        created.id
      );

      await repo.update(
        new IndexedFsModel({
          ...created,
          category: "updated",
        })
      );

      const updatedIndex = JSON.parse(await fs.readFile(indexFile, "utf8"));
      expect(updatedIndex.entries["updated::Indexed User"]).toBeDefined();
      expect(updatedIndex.entries["initial::Indexed User"]).toBeUndefined();

      await repo.delete(created.id);
      const emptiedIndex = JSON.parse(await fs.readFile(indexFile, "utf8"));
      expect(emptiedIndex.entries).toEqual({});
    } finally {
      await cleanupAlias(alias);
    }
  });

  it("honors the jsonSpacing option", async () => {
    const alias = `fs-adapter-${Date.now()}-json`;
    try {
      const adapter = createAdapter(alias, { jsonSpacing: 2 });
      const repo = new Repository(adapter, FsTestModel);
      const created = await repo.create(
        new FsTestModel({
          id: "pretty-1",
          name: "Pretty",
          nif: "111222333",
        })
      );
      const stored = await fs.readFile(recordPath(alias, created.id), "utf8");
      expect(stored).toContain('\n  "record"');
    } finally {
      await cleanupAlias(alias);
    }
  });

  it("invokes the hydration callback when bootstrapping existing data", async () => {
    const alias = `fs-adapter-${Date.now()}-hydrate`;
    try {
      const adapter = createAdapter(alias);
      const repo = new Repository(adapter, FsTestModel);
      await repo.create(
        new FsTestModel({
          id: "hydrate-1",
          name: "Hydrated",
          nif: "999888777",
        })
      );

      forgetAdapter(adapter);
      await releaseAdapter(adapter);
      clearRepositoryCache(FsTestModel, alias);

      const onHydrated = jest.fn();
      const rehydrated = createAdapter(alias, { onHydrated });
      const rerepo = new Repository(rehydrated, FsTestModel);
      const fetched = await rerepo.read("hydrate-1");
      expect(fetched.name).toBe("Hydrated");
      expect(onHydrated).toHaveBeenCalledWith({
        table: Model.tableName(FsTestModel),
        records: 1,
      });
    } finally {
      await cleanupAlias(alias);
    }
  });
});
