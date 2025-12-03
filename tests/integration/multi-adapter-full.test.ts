import { RamAdapter, RamFlavour } from "../../src/ram/index";
import { Adapter, BaseModel, pk } from "../../src/index";
import { Metadata, uses } from "@decaf-ts/decoration";
import { TestCountryModel } from "../unit/models";
import {
  Model,
  model,
  type ModelArg,
  pattern,
  required,
} from "@decaf-ts/decorator-validation";

class Ram1 extends RamAdapter {
  constructor() {
    super({} as any, "ram1");
  }
}

class Ram2 extends RamAdapter {
  constructor() {
    super({} as any, "ram2");
  }
}

@uses("ram1")
@model()
class Model1 extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  constructor(arg?: ModelArg<Model1>) {
    super(arg);
  }
}
@uses("ram2")
@model()
class Model2 extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  constructor(arg?: ModelArg<Model2>) {
    super(arg);
  }
}

describe("Multi Adapter full test", () => {
  let ram1: RamAdapter;
  let ram2: RamAdapter;

  it("initializes adapters correctly", () => {
    ram1 = new Ram1();
    expect(Adapter.currentFlavour).toEqual("ram1");
    ram2 = new Ram2();
    expect(Adapter.currentFlavour).toEqual("ram2");
  });

  it("Reads default flavour correclty", () => {
    expect(Adapter.currentFlavour).toEqual(RamFlavour);

    const flavour = Metadata.flavourOf(TestCountryModel);
    expect(flavour).toEqual(RamFlavour);
  });

  it("Correctly allows overriding that value", () => {
    uses("dummy")(TestCountryModel);
    const flavour = Metadata.flavourOf(TestCountryModel);
    expect(flavour).toEqual("dummy");
  });

  it("Correctly allows overriding that value in the class", () => {
    @uses("dummy")
    @model()
    class TestCountryModel2 extends BaseModel {
      @pk({ type: "Number" })
      id!: number;

      @required()
      name!: string;

      @required()
      countryCode!: string;

      @required()
      @pattern(/[a-z]{2}(?:_[A-Z]{2})?/g)
      locale!: string;

      constructor(m?: ModelArg<TestCountryModel>) {
        super(m);
      }
    }

    const flavour = Metadata.flavourOf(TestCountryModel2);
    expect(flavour).toEqual("dummy");
  });
});
