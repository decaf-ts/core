import { Dispatch } from "../../src/persistence/Dispatch";
console.log(Dispatch);
import { Adapter, column, pk, repositoryFromTypeMetadata } from "../../src";
import { RamFlavour } from "../../src/ram/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
new RamAdapter();
import { model, Model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";

describe("tests model construction", () => {
  @model()
  class ChildModel extends Model {
    @pk()
    id!: string;

    constructor(arg?: ModelArg<ChildModel>) {
      super(arg);
    }
  }

  @model()
  class TestModel extends Model {
    @pk()
    id!: string;

    @column("tst_child")
    child!: ChildModel;

    constructor(arg?: ModelArg<TestModel>) {
      super(arg);
    }
  }

  it("tests repositoryFromTypeMetadata", async () => {
    const id = Date.now().toString();
    const model = new TestModel({
      id: id,
      child: new ChildModel(),
    });
    const repo2 = repositoryFromTypeMetadata(model, "child");
    expect(repo2).toBeDefined();
  });
});
