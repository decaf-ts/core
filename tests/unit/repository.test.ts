import { Dispatch } from "../../src/persistence/Dispatch";
console.log(Dispatch);
import { Adapter, BaseModel, Observer, repository } from "../../src";
import { RamFlavour } from "../../src/ram/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import { model, Model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { TestModel } from "./TestModel";
import { Repo } from "../../src";
import { uses } from "@decaf-ts/decoration";

describe("Repository", () => {
  let created: TestModel;

  const repo = new Repository(ramAdapter, TestModel);
  let observer: Observer;
  let mock: any;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    jest.resetAllMocks();
    mock = jest.fn();
    observer = new (class implements Observer {
      refresh(...args: any[]): Promise<void> {
        return mock(...args);
      }
    })();
    repo.observe(observer);
  });

  afterEach(() => {
    repo.unObserve(observer);
  });

  it("creates", async () => {
    const id = Date.now().toString();
    const model = new TestModel({
      id: id,
      name: "test_name",
      nif: "123456789",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
    expect(mock).toHaveBeenCalledWith(
      Repository.table(TestModel),
      OperationKeys.CREATE,
      id
    );
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
    expect(updated.equals(created, "updatedOn", "name", "updatedBy")).toEqual(
      true
    ); // minus the expected changes
    expect(mock).toHaveBeenCalledWith(
      Repository.table(TestModel),
      OperationKeys.UPDATE,
      updated.id
    );
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as string);

    expect(deleted).toBeDefined();
    expect(deleted.id).toEqual(created.id); // same model
    await expect(repo.read(created.id as string)).rejects.toThrowError(
      NotFoundError
    );
    expect(mock).toHaveBeenCalledWith(
      Repository.table(TestModel),
      OperationKeys.DELETE,
      deleted.id
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

    it("succeeds being injected", () => {
      @uses("ram")
      @model()
      class StandardRepoTestModel2 extends BaseModel {
        constructor(arg?: ModelArg<StandardRepoTestModel2>) {
          super(arg);
        }
      }

      class TestClass {
        @repository(StandardRepoTestModel2)
        repo!: Repo<StandardRepoTestModel2>;
      }

      const testClass = new TestClass();
      expect(testClass).toBeDefined();
      expect(testClass.repo).toBeDefined();
      expect(testClass.repo).toBeInstanceOf(Repository);
    });

    it("succeeds when using decorators on the repo level", () => {
      @model()
      class DedicatedTestModel extends Model {
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
