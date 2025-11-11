import "reflect-metadata";
import { Repository } from "../../src/repository/Repository";
import { InternalError } from "@decaf-ts/db-decorators";
import { Adapter } from "../../src/persistence/Adapter";
import { PersistenceKeys } from "../../src/persistence/constants";
import { TestModel } from "./TestModel";

// Group related tests for Repository.forModel error paths

describe("repository/Repository.forModel", () => {
  const key = Adapter.key(PersistenceKeys.ADAPTER);

  beforeEach(() => {
    // TODO: Replace with Metdata
    Reflect.deleteMetadata?.(key as any, TestModel as any);
  });

  it("throws InternalError when no adapter is registered for the model flavour", () => {
    // no adapter registered and model has explicit flavour
    // TODO: Replace with Metdata
    Reflect.defineMetadata(key, "nonexistent", TestModel as any);
    expect(() => Repository.forModel(TestModel as any)).toThrow(InternalError);
  });
});
