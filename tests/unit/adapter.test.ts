import { RamAdapter } from "../../src/ram/RamAdapter";
import { Adapter, repository, uses } from "../../src";
import { TestModel } from "./TestModel";
import { findPrimaryKey, Repository } from "@decaf-ts/db-decorators";
import {
  Constructor,
  Model,
  ModelArg,
  model,
} from "@decaf-ts/decorator-validation";

Model.setBuilder(Model.fromModel);

describe("Adapter", () => {
  let adapter: RamAdapter;

  beforeAll(() => {
    adapter = new RamAdapter();
  });

  it("instantiates", () => {
    expect(adapter).toBeDefined();
    expect(Adapter["_cache"]["ram"]).toBeDefined();
  });

  it("defines current", () => {
    expect(Adapter.current).toBeUndefined();
    Adapter.setCurrent("ram");
    expect(Adapter.current).toBeDefined();
    expect(Adapter.current).toEqual(Adapter.get("ram"));
  });

  let create: TestModel;
  let prepared: Record<string, any>;

  it("prepares models", async () => {
    create = new TestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789",
    });

    const { record, id } = adapter.prepare(create, findPrimaryKey(create).id);
    expect(record).toMatchObject({
      tst_name: create.name,
      tst_nif: create.nif,
      createdOn: undefined,
      updatedOn: undefined,
    });
    expect(id).toEqual(create.id);
    prepared = record;
  });

  it("reverts models", async () => {
    const reverted = adapter.revert(
      prepared,
      TestModel,
      "id",
      create.id as string
    ) as TestModel;
    expect(reverted).toBeDefined();
    expect(reverted).toBeInstanceOf(TestModel);
    expect(reverted.equals(create)).toEqual(true);
  });

  describe("Model management", () => {
    @uses("ram")
    @model()
    class ManagedModel extends Model {
      constructor(arg?: ModelArg<ManagedModel>) {
        super(arg);
      }
    }

    // it("Fails to recognized an unregistered model", () => {
    //   const managedModels = Adapter.models("ram");
    //   expect(managedModels).toBeDefined();
    // });

    it("Recognizes adapter registrations at the model level", () => {
      const managedModels = Adapter.models("ram");
      expect(managedModels).toBeDefined();
    });

    @model()
    class Managed2Model extends Model {
      constructor(arg?: ModelArg<ManagedModel>) {
        super(arg);
      }
    }

    @repository(Managed2Model)
    @uses("ram")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    class Managed2ModelRepository extends Repository<Managed2Model> {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      create(model: Managed2Model, ...args: any[]): Promise<Managed2Model> {
        throw new Error("Method not implemented.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      read(key: string | number, ...args: any[]): Promise<Managed2Model> {
        throw new Error("Method not implemented.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      update(model: Managed2Model, ...args: any[]): Promise<Managed2Model> {
        throw new Error("Method not implemented.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      delete(key: string | number, ...args: any[]): Promise<Managed2Model> {
        throw new Error("Method not implemented.");
      }
      constructor(clazz: Constructor<Managed2Model>) {
        super(clazz);
      }
    }

    it("Recognizes adapter registrations at the repo level", () => {
      const managedModels = Adapter.models("ram");
      expect(managedModels).toBeDefined();
    });
  });
});
