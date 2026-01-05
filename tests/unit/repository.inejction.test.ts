import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { Adapter, pk, Repository, repository } from "../../src/index";
import { RamAdapter } from "../../src/ram/index";

describe("repository injection", () => {
  beforeAll(() => {
    const adapter = new RamAdapter();
    Adapter.setCurrent(adapter.flavour);
  });

  it("Properly injects a repository", async () => {
    @model()
    class RepoInjectionModel extends Model {
      @pk({ type: "Number" })
      id!: number;

      @required()
      name!: string;

      constructor(arg?: ModelArg<RepoInjectionModel>) {
        super(arg);
      }
    }

    @repository(RepoInjectionModel)
    class Repo extends Repository<RepoInjectionModel, any> {
      constructor(adapter?: any) {
        super(adapter, RepoInjectionModel);
      }
    }

    const repo = Repository.forModel(RepoInjectionModel);

    expect(repo).toBeDefined();
    expect(repo).toBeInstanceOf(Repo);

    const created = await repo.create(new RepoInjectionModel({ name: "Test" }));
    expect(created).toBeDefined();
    expect(created).toBeInstanceOf(RepoInjectionModel);
  });
});
