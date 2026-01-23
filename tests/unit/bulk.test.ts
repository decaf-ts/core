import { minlength, model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { BaseModel, pk, Repository, PersistenceKeys } from "../../src/index";
import type { RamRepository } from "../../src/ram/types";
import { uses } from "@decaf-ts/decoration";

jest.setTimeout(50000);

describe("Bulk operations", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  @uses("ram")
  @model()
  class TestBulkModel extends BaseModel {
    @pk({ type: Number })
    id?: number = undefined;

    @required()
    @minlength(5)
    attr1?: string = undefined;

    constructor(arg?: ModelArg<TestBulkModel>) {
      super(arg);
    }
  }

  let created: TestBulkModel[];
  let updated: TestBulkModel[];

  it("creates one", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const created = await repo.create(
      new TestBulkModel({
        attr1: "attr1",
      })
    );
    expect(created).toBeDefined();
  });

  it("Creates in bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const models = [1].map(
      (i) =>
        new TestBulkModel({
          attr1: "user_name_" + i,
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("Reads in Bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const ids = created.map((c) => c.id) as number[];
    const read = await repo.readAll(ids);
    expect(read).toBeDefined();
    expect(Array.isArray(read)).toEqual(true);
    expect(read.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(read.every((el) => !el.hasErrors())).toEqual(true);
    expect(read.every((el, i) => el.equals(created[i]))).toEqual(true);
    expect(read.every((el) => !!(el as any)[PersistenceKeys.METADATA]));
  });

  it("Updates in Bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const toUpdate = created.map((c, i) => {
      return new TestBulkModel({
        id: c.id,
        attr1: "updated_name_" + i,
      });
    });
    updated = await repo.updateAll(toUpdate);
    expect(updated).toBeDefined();
    expect(Array.isArray(updated)).toEqual(true);
    expect(updated.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(updated.every((el) => !el.hasErrors())).toEqual(true);
    expect(updated.every((el, i) => !el.equals(created[i]))).toEqual(true);
  });

  it("Deletes in Bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const ids = created.map((c) => c.id);
    const deleted = await repo.deleteAll(ids as number[]);
    expect(deleted).toBeDefined();
    expect(Array.isArray(deleted)).toEqual(true);
    expect(deleted.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
    expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);
    for (const k in created.map((c) => c.id)) {
      await expect(repo.read(k)).rejects.toThrowError(NotFoundError);
    }
  });
});
