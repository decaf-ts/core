import { model, Model, type ModelArg } from "@decaf-ts/decorator-validation";
import {
  BaseModel,
  Context,
  pk,
  Repo,
  sequence,
  table,
  version,
  Repository,
} from "../../src";
import { uses } from "@decaf-ts/decoration";
import {
  BulkCrudOperationKeys,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { RamAdapter, RamFlavour } from "../../src/ram/index";

jest.setTimeout(150000);

@uses(RamFlavour)
@table("tst_persistent_version_pouch")
@model()
class PersistentVersionModel extends BaseModel {
  @pk({ type: Number, generated: false })
  id!: number;

  @version(true)
  version!: number;

  constructor(arg?: ModelArg<PersistentVersionModel>) {
    super(arg);
  }
}

@uses(RamFlavour)
@table("tst_sequence_per_instance_pouch")
@model()
class SequencePerInstanceModel extends BaseModel {
  @pk({ type: Number, generated: false })
  id!: number;

  @sequence({ type: Number })
  step!: number;

  constructor(arg?: ModelArg<SequencePerInstanceModel>) {
    super(arg);
  }
}

describe("core decorators on pouch adapter", () => {
  let adapter: RamAdapter;
  let versionRepo: Repo<PersistentVersionModel>;
  let seqRepo: Repo<SequencePerInstanceModel>;

  beforeAll(async () => {
    adapter = new RamAdapter({ user: "uesr" });
    await adapter.initialize();

    versionRepo = Repository.forModel(PersistentVersionModel);
    seqRepo = Repository.forModel(SequencePerInstanceModel);
  });

  it("@version(true) increments across update/delete/recreate for the same pk (and supports bulk ops)", async () => {
    const created = await versionRepo.create(
      new PersistentVersionModel({ id: 1 })
    );
    expect(created.version).toBe(1);
    expect(Model.versionOf(created)).toBe(1);

    const updateCtx1 = await Context.from(
      OperationKeys.UPDATE,
      {},
      PersistentVersionModel
    );
    const updated1 = await versionRepo.update(
      new PersistentVersionModel({ ...created }),
      updateCtx1 as any
    );
    expect(updated1.version).toBe(2);
    expect(Model.versionOf(updated1)).toBe(2);

    const updateCtx2 = await Context.from(
      OperationKeys.UPDATE,
      {},
      PersistentVersionModel
    );
    const updated2 = await versionRepo.update(
      new PersistentVersionModel({ ...updated1 }),
      updateCtx2 as any
    );
    expect(updated2.version).toBe(3);
    expect(Model.versionOf(updated2)).toBe(3);

    await versionRepo.delete(updated2.id);

    const recreated = await versionRepo.create(
      new PersistentVersionModel({ id: 1 })
    );
    expect(recreated.version).toBe(4);
    expect(Model.versionOf(recreated)).toBe(4);

    const createAllCtx = await Context.from(
      BulkCrudOperationKeys.CREATE_ALL,
      {},
      PersistentVersionModel
    );
    const updateAllCtx = await Context.from(
      BulkCrudOperationKeys.UPDATE_ALL,
      {},
      PersistentVersionModel
    );

    const bulkCreated = await versionRepo.createAll(
      [
        new PersistentVersionModel({ id: 10 }),
        new PersistentVersionModel({ id: 11 }),
      ],
      createAllCtx as any
    );
    expect(bulkCreated.map((m) => m.version)).toEqual([1, 1]);

    const bulkUpdated = await versionRepo.updateAll(
      bulkCreated.map((m) => new PersistentVersionModel({ ...m })),
      updateAllCtx as any
    );
    expect(bulkUpdated.map((m) => m.version)).toEqual([2, 2]);

    await versionRepo.deleteAll([10, 11]);

    const bulkRecreated = await versionRepo.createAll(
      [
        new PersistentVersionModel({ id: 10 }),
        new PersistentVersionModel({ id: 11 }),
      ],
      createAllCtx as any
    );
    expect(bulkRecreated.map((m) => m.version)).toEqual([3, 3]);

    await versionRepo.deleteAll([10, 11]);
  });

  it("@sequence() is per-model-instance (pk + property), not global per class (without override)", async () => {
    const repo = seqRepo;

    let a = await repo.create(new SequencePerInstanceModel({ id: 1 }));
    let b = await repo.create(new SequencePerInstanceModel({ id: 2 }));

    expect(a.step).toBe(1);
    expect(b.step).toBe(1);

    a = await repo.delete(1);
    b = await repo.update(b);

    expect(a.step).toBe(1);
    expect(b.step).toBe(1);

    a = await repo.create(new SequencePerInstanceModel({ id: 1 }));
    delete b.step;
    b = await repo.update(b);

    expect(a.step).toBe(2);
    expect(b.step).toBe(1);
  });

  it("@sequence() seeds from provided value when sequence does not exist, and continues after delete + recreate (with override)", async () => {
    const seedCtx = await Context.from(
      OperationKeys.CREATE,
      { allowGenerationOverride: true } as any,
      SequencePerInstanceModel
    );
    const seeded = await seqRepo.create(
      new SequencePerInstanceModel({ id: 99, step: 10 }),
      seedCtx as any
    );
    expect(seeded.step).toBe(10);

    await seqRepo.delete(99);

    const next = await seqRepo.create(new SequencePerInstanceModel({ id: 99 }));
    expect(next.step).toBe(11);
  });
});
