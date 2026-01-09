import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { Adapter, pk, Repo, repository, Repository } from "../../src/index";
import { RamAdapter } from "../../src/ram/index";

describe("repository non explicit injection", () => {
  beforeAll(() => {
    const adapter = new RamAdapter();
    Adapter.setCurrent(adapter.flavour);
  });

  @model()
  class RepoInjectionModel2 extends Model {
    @pk({ type: "Number" })
    id!: number;

    @required()
    name!: string;

    constructor(arg?: ModelArg<RepoInjectionModel2>) {
      super(arg);
    }
  }

  it("Properly injects a repository in a class", async () => {
    class TestClass {
      @repository(RepoInjectionModel2)
      repo: Repo<RepoInjectionModel2>;
    }

    const tc = new TestClass();

    expect(tc.repo).toBeDefined();
    expect(tc.repo).toBeInstanceOf(Repository);

    const m = new RepoInjectionModel2({ name: "Test" });

    const created = await tc.repo.create(m);
    expect(created).toBeDefined();
    expect(created).toBeInstanceOf(RepoInjectionModel2);
  });

  it("Properly injects a repository", async () => {
    const repo = Repository.forModel(RepoInjectionModel2);

    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(Repository);

    const created = await repo.create(
      new RepoInjectionModel2({ name: "Test" })
    );
    expect(created).toBeDefined();
    expect(created).toBeInstanceOf(RepoInjectionModel2);
  });
});
