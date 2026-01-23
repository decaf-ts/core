import { RamAdapter, RamFlavour } from "../../src/ram";
import { column, ModelService, pk, Repo, repository, table } from "../../src";
import { service } from "../../src/utils/decorators";
import { NotFoundError } from "@decaf-ts/db-decorators";
import {
  maxlength,
  minlength,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { IdentifiedBaseModel } from "./IdentifiedBaseModel";
import { uses } from "@decaf-ts/decoration";
import {
  InjectableRegistryImp,
  Injectables,
} from "@decaf-ts/injectable-decorators";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const adapter = new RamAdapter();

@uses(RamFlavour)
@table("tst_user")
@model()
export class TestModel extends IdentifiedBaseModel {
  @pk({ type: Number, generated: true })
  id!: number;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}

@service(TestModel)
class TestUserService extends ModelService<TestModel> {
  constructor() {
    super(TestModel);
  }
}

class Obj {
  @service(TestModel)
  service!: TestUserService;

  @repository(TestModel)
  repo!: Repo<TestModel>;

  constructor() {}
}

describe("Model Services", () => {
  let obj: Obj;

  beforeAll(() => {
    obj = new Obj();
  });

  it("gets injected as a repo", async () => {
    // expect(obj.repo).toBeDefined();
    // expect(obj.repo).toBeInstanceOf(Repository);

    expect(obj.service).toBeDefined();
    expect(obj.service).toBeInstanceOf(TestUserService);
  });

  it("acts as a repo", async () => {
    const model = new TestModel({
      name: "test_name",
      nif: "123123123",
    });

    const created = await obj.service.create(model);

    expect(created).toBeDefined();
    expect(created.hasErrors()).toBeUndefined();

    const read = await obj.service.read(created.id);

    expect(read).toBeDefined();
    expect(read.equals(created)).toBe(true);

    const updated = await obj.service.update(
      new TestModel({
        id: created.id,
        name: "new_test_name",
      })
    );

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toBe(false);
    expect(updated.equals(created, "name", "updatedAt", "updatedBy")).toBe(
      true
    );

    const deleted = await obj.service.delete(created.id);

    expect(deleted).toBeDefined();

    await expect(obj.service.read(created.id)).rejects.toThrow(NotFoundError);
  });

  describe("Static Methods", () => {
    @uses(RamFlavour)
    @table("tst_name")
    @model()
    class TestNameModel extends IdentifiedBaseModel {
      @pk()
      id!: number;

      @column("tst_name")
      @required()
      name!: string;

      constructor(arg?: ModelArg<TestNameModel>) {
        super(arg);
      }
    }

    it("should create a ModelService instance", async () => {
      const service = ModelService.forModel(TestNameModel);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(ModelService);
      expect(new service.class()).toBeInstanceOf(TestNameModel);

      const serviceInj = ModelService.getService(TestNameModel);
      expect(serviceInj).toBeDefined();
      expect(serviceInj).toBeInstanceOf(ModelService);
    });

    it("should get injectable properly", async () => {
      Injectables.setRegistry(new InjectableRegistryImp());
      expect(() => ModelService.getService(TestNameModel)).toThrow(
        "No ModelService found for alias TestNameModelService"
      );

      // get by model
      ModelService.forModel(TestNameModel);
      const s1 = ModelService.getService(TestNameModel);
      expect(s1).toBeDefined();
      expect(s1).toBeInstanceOf(ModelService);

      // get by name
      Injectables.setRegistry(new InjectableRegistryImp());
      expect(() => ModelService.getService(TestNameModel)).toThrow(
        "No ModelService found for alias TestNameModelService"
      );
      ModelService.forModel(TestNameModel);
      const s2 = ModelService.getService("TestNameModelService");
      expect(s2).toBeDefined();
      expect(s2).toBeInstanceOf(ModelService);
    });

    it("should get already created service", async () => {
      Injectables.setRegistry(new InjectableRegistryImp());
      expect(() => ModelService.getService(TestNameModel)).toThrow(
        "No ModelService found for alias TestNameModelService"
      );

      @service("TestNameModelService")
      class TestNameModelService extends ModelService<TestNameModel> {
        constructor() {
          super(TestNameModel);
        }

        method() {
          throw new Error("Method not implemented");
        }
      }

      const serviceInstance = new TestNameModelService();
      const serviceFromRegistry = ModelService.forModel(TestNameModel);
      expect(serviceInstance.name).toEqual("TestNameModelService");
      expect(serviceInstance.name).toEqual(serviceFromRegistry.name);
      expect(serviceFromRegistry).toBeDefined();
      expect(() =>
        (serviceFromRegistry as TestNameModelService).method()
      ).toThrow("Method not implemented");
      expect(() => serviceInstance.method()).toThrow("Method not implemented");
    });
  });
});
