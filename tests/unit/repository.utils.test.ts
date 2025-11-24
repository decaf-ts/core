import "reflect-metadata";
import { generateInjectableNameForRepository } from "../../src/repository/utils";
import { TestModel } from "./TestModel";
import {
  DecorationKeys,
  DefaultFlavour,
  Metadata,
  uses,
} from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";

describe("repository/utils.generateInjectableNameForRepository", () => {
  it("throws InternalError when flavour cannot be resolved", () => {
    expect(() => generateInjectableNameForRepository(TestModel as any)).toThrow(
      /Could not retrieve flavour from model TestModel/
    );
  });

  it("uses provided flavour and constructor to generate name", () => {
    const name = generateInjectableNameForRepository(TestModel as any, "ram");
    // expected: decaf_{flavour}_adapter_for_{table}
    expect(name).toBe(
      `decaf_ram_adapter_for_${Model.tableName(TestModel as any)}`
    );
  });

  it("resolves flavour from metadata on constructor", () => {
    const meta1 = Metadata.get(TestModel);

    expect(meta1[DecorationKeys.FLAVOUR]).toEqual(DefaultFlavour);
    uses("ram")(TestModel);

    const meta2 = Metadata.get(TestModel);
    expect(meta2[DecorationKeys.FLAVOUR]).toEqual("ram");
    const name = generateInjectableNameForRepository(TestModel as any);
    expect(name).toBe(
      `decaf_ram_adapter_for_${Model.tableName(TestModel as any)}`
    );
  });

  // NOTE: generateInjectableNameForRepository resolves flavour from metadata set on the constructor.
  // Passing a plain instance may not be recognized as a Model by the util, depending on the runtime
  // prototype chain used during tests. We therefore validate the supported/primary usage via constructor.
});
