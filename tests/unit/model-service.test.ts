import { RamAdapter, RamFlavour } from "../../src/ram";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const adapter = new RamAdapter();
import {
  column,
  ModelService,
  pk,
  Repo,
  repository,
  table,
} from "../../src/index";
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

@uses(RamFlavour)
@table("tst_user")
@model()
export class TestModel extends IdentifiedBaseModel {
  @pk({ type: "Number", generated: true })
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
});
