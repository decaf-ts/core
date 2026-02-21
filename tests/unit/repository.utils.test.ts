import "reflect-metadata";
import { generateInjectableNameForRepository } from "../../src/repository/utils";
import {
  Decoration,
  DecorationKeys,
  DefaultFlavour,
  Metadata,
  uses,
} from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { FsTestModel } from "./fs/models/FsTestModel";

describe("repository/utils.generateInjectableNameForRepository", () => {
  beforeEach(() => {
    uses(DefaultFlavour)(FsTestModel);
  });

  it("throws InternalError when flavour cannot be resolved", () => {
    const originalResolver = Decoration["flavourResolver"];
    Decoration["flavourResolver"] = () => DefaultFlavour;
    try {
      expect(() =>
        generateInjectableNameForRepository(FsTestModel as any)
      ).toThrow(/Could not retrieve flavour from model FsTestModel/);
    } finally {
      Decoration["flavourResolver"] = originalResolver;
    }
  });

  it("uses provided flavour and constructor to generate name", () => {
    const name = generateInjectableNameForRepository(
      FsTestModel as any,
      "ram"
    );
    expect(name).toBe(
      `decaf_ram_adapter_for_${Model.tableName(FsTestModel as any)}`
    );
  });

  it("resolves flavour from metadata on constructor", () => {
    uses("ram")(FsTestModel);

    const meta = Metadata.get(FsTestModel);
    expect(meta[DecorationKeys.FLAVOUR]).toEqual("ram");
    const name = generateInjectableNameForRepository(
      FsTestModel as any
    );
    expect(name).toBe(
      `decaf_ram_adapter_for_${Model.tableName(FsTestModel as any)}`
    );
  });

  // NOTE: generateInjectableNameForRepository resolves flavour from metadata set on the constructor.
  // Passing a plain instance may not be recognized as a Model by the util, depending on the runtime
  // prototype chain used during tests. We therefore validate the supported/primary usage via constructor.
});
