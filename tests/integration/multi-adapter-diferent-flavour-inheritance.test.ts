import { RamAdapter, RamFlavour } from "../../src/ram/index";
RamAdapter.decoration();
import { Adapter, createdBy, pk, Repository } from "../../src/index";
Adapter.setCurrent(RamFlavour);

import { Metadata, uses } from "@decaf-ts/decoration";
import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { DummyAdapter } from "./DummyAdapter";
DummyAdapter.decoration();

@uses(RamFlavour)
class Base1 extends Model {
  @pk({ type: "Number", generated: true })
  id1!: number;

  @required()
  name1!: string;

  @createdBy()
  owner1!: string;

  constructor(arg?: ModelArg<Base1>) {
    super(arg);
  }
}

@uses("dummy")
class Base2 extends Model {
  @pk({ type: "Number", generated: true })
  id1!: number;

  @required()
  name1!: string;

  @createdBy()
  owner1!: string;

  constructor(arg?: ModelArg<Base2>) {
    super(arg);
  }
}
@uses(RamFlavour)
@model()
class Model1 extends Base1 {
  constructor(arg?: ModelArg<Model1>) {
    super(arg);
  }
}
@uses("dummy")
@model()
class Model2 extends Base2 {
  constructor(arg?: ModelArg<Model2>) {
    super(arg);
  }
}

describe("Multi Adapter full test with inheritance (explicit @uses in base class)", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let ram1: RamAdapter;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let ram2: DummyAdapter;

  it("displays the correct decoration for model1", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const meta1 = Metadata.get(Model1);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const meta2 = Metadata.get(Model2);
    //
    // expect(meta1.operations.owner1.on.create.handlers.Model1.owner1);
    // console.log(meta1);
  });

  it("initializes adapters correctly", () => {
    ram1 = new RamAdapter();
    ram2 = new DummyAdapter();
  });

  it("Reads default flavour correctly", async () => {
    const repo1 = Repository.forModel(Model1);
    expect(repo1).toBeDefined();
    expect(repo1["adapter"]).toBeInstanceOf(RamAdapter);
    const repo2 = Repository.forModel(Model2);
    expect(repo2).toBeDefined();
    expect(repo2["adapter"]).toBeInstanceOf(DummyAdapter);
    const created1 = await repo1.create(
      new Model1({
        name1: "test1",
      })
    );

    expect(created1).toBeDefined();
    expect(created1.hasErrors()).toBeUndefined();
    expect(created1.owner1).toEqual(expect.any(String));

    const created2 = await repo2.create(
      new Model2({
        name1: "test2",
      })
    );

    expect(created2).toBeDefined();
    expect(created2.hasErrors()).toBeUndefined();
    expect(created2.owner1).toEqual("DUMMY_USER_ID");
  });
});
