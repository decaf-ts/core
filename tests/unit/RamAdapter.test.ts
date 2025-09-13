import { RamAdapter } from "../../src/ram/RamAdapter";

const adapter = new RamAdapter();

import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "./TestModel";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { RamRepository } from "../../src/ram/types";
import { Repository } from "../../src/repository/index";
import { PersistenceKeys } from "../../src/index";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("Ram Adapter Integration", () => {
  const repo: RamRepository<TestModel> = new Repository(adapter, TestModel);

  let created: TestModel, updated: TestModel;

  it("creates", async () => {
    const obj = {
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789",
    };

    const model = new TestModel(obj);
    console.log(model.toString());
    created = await repo.create(model);

    expect(created).toBeDefined();
    // const metadata = (created as any)[PersistenceKeys.METADATA];
    // expect(metadata).toBeDefined();
  });

  it("reads", async () => {
    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
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
    expect(updated.equals(created, "updatedOn", "name", "updatedBy")).toEqual(
      true
    ); // minus the expected changes
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id);
    expect(deleted).toBeDefined();
    expect(deleted.equals(updated)).toEqual(true);

    await expect(repo.read(created.id)).rejects.toThrowError(NotFoundError);
  });

  it("bulk reads return metadata", async () => {});
});
