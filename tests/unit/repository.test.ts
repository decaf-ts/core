import { RamAdapter } from "../../src/ram/RamAdapter";

const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import { model, Model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Adapter, BaseModel, repository, uses } from "../../src";
import { TestModel } from "./TestModel";

Model.setBuilder(Model.fromModel);

describe("Repository", () => {
  let created: TestModel;

  const repo = new Repository(ramAdapter, TestModel);

  it("creates", async () => {
    const model = new TestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
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

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedOn", "name")).toEqual(true); // minus the expected changes
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as string);

    expect(deleted).toBeDefined();
    expect(deleted.id).toEqual(created.id); // same model
    await expect(repo.read(created.id as string)).rejects.toThrowError(
      NotFoundError
    );
  });

  describe("Repository registration", () => {
    it("succeeds when using @use on the model level", () => {
      @uses("ram")
      @model()
      class StandardRepoTestModel extends BaseModel {
        constructor(arg?: ModelArg<StandardRepoTestModel>) {
          super(arg);
        }
      }

      const repo = Repository.forModel(StandardRepoTestModel);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(Repository);
    });

    it("succeeds when using decorators on the repo level", () => {
      @model()
      class DedicatedTestModel extends TestModel {
        constructor(arg: ModelArg<DedicatedTestModel>) {
          super(arg);
        }
      }

      @repository(DedicatedTestModel)
      @uses("ram")
      class DedicatedTestModelRepo extends Repository<
        DedicatedTestModel,
        any,
        Adapter<any, any, any, any>
      > {
        constructor(adapter: Adapter<any, any, any, any>) {
          super(adapter);
        }
      }

      const repo = Repository.forModel(DedicatedTestModel);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(DedicatedTestModelRepo);
    });
  });
});
