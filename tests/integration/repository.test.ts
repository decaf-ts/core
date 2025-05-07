import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "../TestModel";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { repository, Repository } from "../../src/repository";
import { RamRepository } from "../../src/ram/types";
import { uses } from "../../src";

Model.setBuilder(Model.fromModel);

jest.setTimeout(50000);

describe("repositories", () => {
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  it("instantiates via constructor", () => {
    const repo: RamRepository<TestModel> = new Repository(
      adapter as any,
      TestModel
    );
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(Repository);
  });

  it("instantiates via Repository.get with @uses decorator on model", () => {
    uses("ram")(TestModel);
    const repo = Repository.forModel(TestModel);
    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(Repository);
  });

  it("gets injected when using @repository", () => {
    class TestClass {
      @repository(TestModel)
      repo!: RamRepository<TestModel>;
    }

    const testClass = new TestClass();
    expect(testClass).toBeDefined();
    expect(testClass.repo).toBeDefined();
    expect(testClass.repo).toBeInstanceOf(Repository);
  });
});
