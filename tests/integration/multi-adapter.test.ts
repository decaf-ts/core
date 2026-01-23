import { RamAdapter, RamFlavour } from "../../src/ram/index";
import { Adapter, BaseModel, pk } from "../../src/index";
import { DummyAdapter } from "./DummyAdapter";
import { Metadata, uses } from "@decaf-ts/decoration";
import { TestCountryModel } from "../unit/models";
import {
  model,
  type ModelArg,
  pattern,
  required,
} from "@decaf-ts/decorator-validation";

describe("Multi Adapter Integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let ram: RamAdapter;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let dummy: DummyAdapter;

  beforeAll(() => {});

  it("initializes adapters correctly", () => {
    ram = new RamAdapter();
    dummy = new DummyAdapter();
    expect(Adapter.currentFlavour).toEqual(RamFlavour);
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
      @pk({ type: Number })
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
