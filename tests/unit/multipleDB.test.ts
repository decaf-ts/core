import {
  min,
  minlength,
  model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { RamAdapter } from "../../src/ram/RamAdapter";
import {
  BaseModel,
  index,
  OrderDirection,
  pk,
  Repository,
} from "../../src/index";
import { readonly } from "@decaf-ts/db-decorators";
import { Metadata, uses } from "@decaf-ts/decoration";

jest.setTimeout(50000);

describe("Adapter Integration", () => {
  let adapter1: RamAdapter;
  let adapter2: RamAdapter;

  beforeAll(async () => {
    adapter1 = new RamAdapter({ user: "user1" }, "db1");
    adapter2 = new RamAdapter({ user: "user1" }, "db2");
  });

  @uses("ram")
  @model()
  class TestUserMultipleDB extends BaseModel {
    @pk({ type: "Number" })
    id!: number;

    @required()
    @min(18)
    @index([OrderDirection.DSC, OrderDirection.ASC])
    age!: number;

    @required()
    @minlength(5)
    name!: string;

    @required()
    @readonly()
    @type([String])
    sex!: "M" | "F";

    constructor(arg?: ModelArg<TestUserMultipleDB>) {
      super(arg);
    }
  }

  it("expects to have a ram flavour", () => {
    expect(Metadata.flavourOf(TestUserMultipleDB)).toEqual("ram");
  });

  it.skip("Create and read on multiple DBs", async () => {
    const repo1 = new Repository(adapter1, TestUserMultipleDB);

    const model1 = new TestUserMultipleDB({
      age: 20,
      name: "User1",
      sex: "M",
    });

    const created1 = await repo1.create(model1);
    expect(created1).toBeDefined();
    expect(!created1.hasErrors()).toBe(true);

    const repo2 = new Repository(adapter2, TestUserMultipleDB);

    const model2 = new TestUserMultipleDB({
      age: 21,
      name: "User2",
      sex: "F",
    });

    const created2 = await repo2.create(model2);
    expect(created2).toBeDefined();
    expect(!created2.hasErrors()).toBe(true);

    const result1 = await repo1.read(created1.id);
    expect(created1).toEqual(result1);

    const result2 = await repo2.read(created2.id);
    expect(created2).toEqual(result2);
  });
});
