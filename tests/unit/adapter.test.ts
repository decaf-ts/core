import { RamAdapter, RamRepository } from "../../src/ram";
const adapter = new RamAdapter();
import { Adapter, repository, Repository } from "../../src";
import { TestModel } from "./TestModel";
import { NotFoundError } from "@decaf-ts/db-decorators";
import { Model, model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Constructor, uses } from "@decaf-ts/decoration";

describe("Adapter", () => {
  let repo: RamRepository<TestModel>;

  beforeAll(async () => {
    repo = new Repository(adapter, TestModel);
  });

  it("instantiates", () => {
    expect(adapter).toBeDefined();
    expect(Adapter["_cache"]["ram"]).toBeDefined();
  });

  it("defines current", () => {
    expect(Adapter.current).toBeDefined();
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

    const { record, id } = adapter.prepare(create, {} as any);
    expect(record).toMatchObject({
      tst_name: create.name,
      tst_nif: create.nif,
    });
    expect(id).toEqual(create.id);
    prepared = record;
  });

  it("reverts models", async () => {
    const reverted = adapter.revert(
      prepared,
      TestModel,
      create.id as string,
      undefined,
      {} as any
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
    class Managed2ModelRepository extends Repository<Managed2Model, any> {
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

    let created: TestModel, updated: TestModel;

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
  });
});
