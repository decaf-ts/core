import "reflect-metadata";
import {
  Adapter,
  Repo,
  Repository,
  repository,
} from "../../src/index";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { InjectablesRegistry } from "../../src/repository/injectables";
import {
  Model,
  model,
  type ModelArg,
} from "@decaf-ts/decorator-validation";
import { RamAdapter } from "../../src/ram";

const ramAdapter = new RamAdapter();
Adapter.setCurrent(ramAdapter.alias);

describe("repository decorator injection variants", () => {
  beforeEach(() => {
    Injectables.setRegistry(new InjectablesRegistry());
    (Repository as unknown as { _cache: Record<string, unknown> })._cache = {};
    Adapter.setCurrent(ramAdapter.alias);
  });

  it("injects the default repository instance for a model", () => {
    @model()
    class DefaultRepoModel extends Model {
      constructor(arg?: ModelArg<DefaultRepoModel>) {
        super(arg);
      }
    }

    class DefaultRepoConsumer {
      @repository(DefaultRepoModel)
      repo!: Repo<DefaultRepoModel>;
    }

    const consumer = new DefaultRepoConsumer();
    const injectedRepo = consumer.repo;

    expect(injectedRepo).toBeInstanceOf(Repository);

    const repoFromFactory = Repository.forModel(DefaultRepoModel);
    expect(repoFromFactory).toBeInstanceOf(Repository);
    expect(injectedRepo).toBe(repoFromFactory);
  });

  it("injects a custom repository decorated with @repository(ModelClass)", () => {
    @model()
    class DecoratedRepoModel extends Model {
      constructor(arg?: ModelArg<DecoratedRepoModel>) {
        super(arg);
      }
    }

    @repository(DecoratedRepoModel)
    class DecoratedRepo extends Repository<DecoratedRepoModel, RamAdapter> {
      constructor(adapter: RamAdapter = Adapter.get(ramAdapter.alias) as RamAdapter) {
        super(adapter, DecoratedRepoModel);
      }
    }

    class DecoratedRepoConsumer {
      @repository(DecoratedRepoModel)
      repo!: DecoratedRepo;
    }

    const consumer = new DecoratedRepoConsumer();
    const injectedRepo = consumer.repo;

    expect(injectedRepo).toBeInstanceOf(DecoratedRepo);

    const repoFromFactory = Repository.forModel(DecoratedRepoModel);
    expect(repoFromFactory).toBeInstanceOf(DecoratedRepo);
    expect(injectedRepo).toBe(repoFromFactory);
  });

  it("reuses the repository singleton across multiple injection sites", () => {
    @model()
    class SharedRepoModel extends Model {
      constructor(arg?: ModelArg<SharedRepoModel>) {
        super(arg);
      }
    }

    class FirstConsumer {
      @repository(SharedRepoModel)
      repo!: Repo<SharedRepoModel>;
    }

    class SecondConsumer {
      @repository(SharedRepoModel)
      repo!: Repo<SharedRepoModel>;
    }

    const first = new FirstConsumer();
    const second = new SecondConsumer();

    expect(first.repo).toBeInstanceOf(Repository);
    expect(second.repo).toBeInstanceOf(Repository);
    expect(first.repo).toBe(second.repo);
    expect(first.repo).toBe(Repository.forModel(SharedRepoModel));
  });
});
