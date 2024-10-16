import {TestModel} from "./TestModel";
import {RamAdapter} from "./RamAdapter";
import {Repository} from "../../src/repository/Repository";
import {model, Model, ModelArg} from "@decaf-ts/decorator-validation";
import {DBModel, InternalError, NotFoundError} from "@decaf-ts/db-decorators";
import {Adapter, BaseModel, getPersistenceKey, PersistenceKeys, repository, uses} from "../../src";

Model.setBuilder(Model.fromModel)

describe("Repository", () => {

  let created: TestModel;
  const ramAdapter = new RamAdapter();
  const repo = new Repository(ramAdapter, TestModel);

  it("creates", async () => {
    const model = new TestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789"
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
  })

  it("reads", async () => {

    const read = await repo.read(created.id as string);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
  })

  it("updates", async () => {

    const toUpdate = new TestModel(Object.assign({}, created, {
      name: "new_test_name"
    }))

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedOn", "name")).toEqual(true); // minus the expected changes
  })

  it("deletes", async () => {

    const deleted = await repo.delete(created.id as string);

    expect(deleted).toBeDefined();
    expect(deleted.id).toEqual(created.id); // same model
    await expect(repo.read(created.id as string)).rejects.toThrowError(NotFoundError)
  })

  describe("Repository registration", () => {
    it("fails to retrieve the repository for this model without registration", () => {
      expect(() => Repository.forModel(TestModel)).toThrowError(InternalError)
    })

    it("succeeds when using @use on the model level", () => {
      @uses("ram")
      @model()
      class StandardRepoTestModel extends BaseModel {
        constructor(arg?: ModelArg<StandardRepoTestModel>) {
          super(arg);
        }
      }

      const metadata = Reflect.getMetadata(getPersistenceKey(PersistenceKeys.ADAPTER), StandardRepoTestModel)
      const repo = Repository.forModel(StandardRepoTestModel);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(Repository);
    })

    it("succeeds when using decorators on the repo level", () => {
      @model()
      class DedicatedTestModel extends TestModel{
        constructor(arg: ModelArg<DedicatedTestModel>) {
          super(arg);
        }
      }

      @repository(DedicatedTestModel)
      @uses("ram")
      class DedicatedTestModelRepo extends Repository<DedicatedTestModel>{
        constructor(adapter: Adapter<any, any>) {
          super(adapter);
        }
      }

      const repo = Repository.forModel(DedicatedTestModel);
      expect(repo).toBeDefined();
      expect(repo).toBeInstanceOf(DedicatedTestModelRepo);
    })
  })
})