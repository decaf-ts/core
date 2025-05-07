import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "../TestModel";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamRepository } from "../../src/ram/types";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { Repository } from "../../src/repository";
import { PersistenceKeys } from "../../src";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Adapter Integration", () => {
  let adapter: RamAdapter;
  let repo: RamRepository<TestModel>;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new Repository(adapter, TestModel);
  });

  let created: TestModel, updated: TestModel;

  it("creates", async () => {
    const model = new TestModel({
      id: Date.now(),
      name: "test_name",
      nif: "123456789",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
    const metadata = (created as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("reads", async () => {
    const read = await repo.read(created.id as number);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
    const metadata = (read as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("updates", async () => {
    const toUpdate = new TestModel(
      Object.assign({}, created, {
        name: "new_test_name",
      })
    );

    updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedOn", "name")).toEqual(true); // minus the expected changes
    const metadata = (updated as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as number);
    expect(deleted).toBeDefined();
    expect(deleted.equals(updated)).toEqual(true);

    await expect(repo.read(created.id as number)).rejects.toThrowError(
      NotFoundError
    );

    const metadata = (deleted as any)[PersistenceKeys.METADATA];
    expect(metadata).toBeDefined();
  });

  it("bulk reads return metadata", async () => {});
});
