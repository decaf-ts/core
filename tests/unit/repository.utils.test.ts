import "reflect-metadata";
import { generateInjectableNameForRepository } from "../../src/repository/utils";
import { PersistenceKeys } from "../../src/persistence/constants";
import { Repository } from "../../src/repository/Repository";
import { Adapter } from "../../src/persistence/Adapter";
import { TestModel } from "./TestModel";
import { Metadata } from "@decaf-ts/decoration";

// Group related tests for repository utils

describe("repository/utils.generateInjectableNameForRepository", () => {
  const key = Adapter.key(PersistenceKeys.ADAPTER);

  beforeEach(() => {
    // ensure clean metadata before each test
    Reflect.deleteMetadata?.(key as any, TestModel as any);
  });

  it("throws InternalError when flavour cannot be resolved", () => {
    expect(() => generateInjectableNameForRepository(TestModel as any)).toThrow(
      /Could not retrieve flavour from model TestModel/
    );
  });

  it("uses provided flavour and constructor to generate name", () => {
    const name = generateInjectableNameForRepository(TestModel as any, "ram");
    // expected: decaf_{flavour}_adapter_for_{table}
    expect(name).toBe(
      `decaf_ram_adapter_for_${Repository.table(TestModel as any)}`
    );
  });

  it("resolves flavour from metadata on constructor", () => {
    Metadata.set(TestModel, key, "ram");
    const name = generateInjectableNameForRepository(TestModel as any);
    expect(name).toBe(
      `decaf_ram_adapter_for_${Repository.table(TestModel as any)}`
    );
  });

  // NOTE: generateInjectableNameForRepository resolves flavour from metadata set on the constructor.
  // Passing a plain instance may not be recognized as a Model by the util, depending on the runtime
  // prototype chain used during tests. We therefore validate the supported/primary usage via constructor.
});
