import "reflect-metadata";
import { repository } from "../../src/repository/decorators";
import { Repository } from "../../src/repository/Repository";
import { DBKeys } from "@decaf-ts/db-decorators";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { TestModel } from "./TestModel";

// Group related tests for repository decorator behavior

describe("repository/decorators", () => {
  it("returns an inject decorator when used as a property decorator", () => {
    class Holder {
      // apply as property decorator (should return inject(...))
      @repository(TestModel)
      repo!: any;
    }

    // Simply constructing the class should not throw; accessing the property would
    // attempt to resolve an injectable which is outside the scope of this test.
    const h = new Holder();
    expect(h).toBeTruthy();
  });

  it("acts as a class decorator to register and define DBKeys.CLASS", () => {
    @repository(TestModel, "ram")
    class TestRepo extends Repository<TestModel, RamAdapter> {}

    const adapter = new RamAdapter();
    const repo = new TestRepo(adapter as any, TestModel);

    // DBKeys.CLASS should be defined as a non-enumerable, non-configurable, non-writable property
    const desc = Object.getOwnPropertyDescriptor(repo, DBKeys.CLASS)!;
    expect(desc).toBeDefined();
    expect(desc.enumerable).toBe(false);
    expect(desc.configurable).toBe(false);
    expect(desc.writable).toBe(false);
    expect(desc.value).toBe(TestModel);
  });
});
