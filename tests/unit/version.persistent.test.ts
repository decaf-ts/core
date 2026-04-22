import {
  BulkCrudOperationKeys,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { uses } from "@decaf-ts/decoration";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";
import { Adapter } from "../../src";
import { Context } from "../../src";
import { pk, table, version } from "../../src/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamFlavour } from "../../src/ram/index";
import { Repository } from "../../src/repository";
import type { RamRepository } from "../../src/ram/types";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

@uses(RamFlavour)
@table("tst_persistent_version")
@model()
class PersistentVersionModel extends Model {
  @pk({ type: Number, generated: true })
  id!: number;

  @version(true)
  version!: number;

  constructor(arg?: ModelArg<PersistentVersionModel>) {
    super(arg);
  }
}

@uses(RamFlavour)
@table("tst_persistent_version_bulk")
@model()
class BulkPersistentVersionModel extends Model {
  @pk({ type: Number, generated: false })
  id!: number;

  @version(true)
  version!: number;

  constructor(arg?: ModelArg<BulkPersistentVersionModel>) {
    super(arg);
  }
}

describe("@version(true) persistent version", () => {
  let adapter: RamAdapter;
  let repo: RamRepository<PersistentVersionModel>;
  let bulkRepo: RamRepository<BulkPersistentVersionModel>;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new Repository(adapter, PersistentVersionModel);
    bulkRepo = new Repository(adapter, BulkPersistentVersionModel);
  });

  it("keeps incrementing across delete + recreate for same pk", async () => {
    const created = await repo.create(new PersistentVersionModel({}));
    expect(created.id).toBeDefined();
    expect(created.version).toBe(1);

    const updateCtx1 = await Context.from(
      OperationKeys.UPDATE,
      {},
      PersistentVersionModel
    );
    const updated1 = await repo.update(
      new PersistentVersionModel({ ...created }),
      updateCtx1 as any
    );
    expect(updated1.version).toBe(2);

    const updateCtx2 = await Context.from(
      OperationKeys.UPDATE,
      {},
      PersistentVersionModel
    );
    const updated2 = await repo.update(
      new PersistentVersionModel({ ...updated1 }),
      updateCtx2 as any
    );
    expect(updated2.version).toBe(3);

    await repo.delete(created.id);

    // Force reusing the same pk (pk generation override), but version should keep incrementing.
    const ctx = await Context.from(
      OperationKeys.CREATE,
      { allowGenerationOverride: true } as any,
      PersistentVersionModel
    );
    const recreated = await repo.create(
      new PersistentVersionModel({ id: created.id }),
      ctx as any
    );

    expect(recreated.id).toBe(created.id);
    expect(recreated.version).toBe(4);

    const updateCtx = await Context.from(
      OperationKeys.UPDATE,
      {},
      PersistentVersionModel
    );
    const updated = await repo.update(
      new PersistentVersionModel({ ...recreated }),
      updateCtx as any
    );
    expect(updated.version).toBe(5);
  });

  it("fails update when applyUpdateValidation is enabled and version mismatches", async () => {
    const ctx = await Context.from(
      OperationKeys.UPDATE,
      { applyUpdateValidation: true } as any,
      PersistentVersionModel
    );

    const created = await repo.create(new PersistentVersionModel({}));
    const wrong = new PersistentVersionModel({ ...created, version: 999 });

    await expect(repo.update(wrong, ctx as any)).rejects.toThrow(
      /Version mismatch/
    );
  });

  it("works with createAll/updateAll/deleteAll and keeps incrementing across delete + recreate for same pks", async () => {
    const createAllCtx = await Context.from(
      BulkCrudOperationKeys.CREATE_ALL,
      {},
      BulkPersistentVersionModel
    );
    const created = await bulkRepo.createAll(
      [
        new BulkPersistentVersionModel({ id: 1 }),
        new BulkPersistentVersionModel({ id: 2 }),
      ],
      createAllCtx as any
    );
    expect(created.map((m) => m.version)).toEqual([1, 1]);

    const updateAllCtx = await Context.from(
      BulkCrudOperationKeys.UPDATE_ALL,
      {},
      BulkPersistentVersionModel
    );
    const updated1 = await bulkRepo.updateAll(
      created.map((m) => new BulkPersistentVersionModel({ ...m })),
      updateAllCtx as any
    );
    expect(updated1.map((m) => m.version)).toEqual([2, 2]);

    const deleted = await bulkRepo.deleteAll([1, 2]);
    expect(deleted.map((m) => m.version)).toEqual([2, 2]);

    const recreated = await bulkRepo.createAll(
      [
        new BulkPersistentVersionModel({ id: 1 }),
        new BulkPersistentVersionModel({ id: 2 }),
      ],
      createAllCtx as any
    );
    expect(recreated.map((m) => m.version)).toEqual([3, 3]);

    const updated2 = await bulkRepo.updateAll(
      recreated.map((m) => new BulkPersistentVersionModel({ ...m })),
      updateAllCtx as any
    );
    expect(updated2.map((m) => m.version)).toEqual([4, 4]);

    await bulkRepo.deleteAll([1, 2]);
  });
});
