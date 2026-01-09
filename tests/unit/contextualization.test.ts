import {
  Adapter,
  column,
  Observer,
  PersistenceKeys,
  pk,
  PreparedStatementKeys,
  RamAdapter,
  RamContext,
  RamRepository,
  Repository,
  table,
} from "../../src/index";
import {
  BulkCrudOperationKeys,
  Context,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import {
  maxlength,
  minlength,
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

describe("Contextualization", () => {
  let adapter: RamAdapter;

  @table("tst_user")
  @model()
  class TestContextModel extends Model {
    @pk()
    id!: number;

    @column("tst_name")
    @required()
    name!: string;

    @column("tst_nif")
    // @unique()
    @minlength(9)
    @maxlength(9)
    @required()
    nif!: string;

    constructor(arg?: ModelArg<TestContextModel>) {
      super(arg);
    }
  }

  @table("tst_repo_user")
  @model()
  class TestContextRepoModel extends Model {
    @pk()
    id!: number;

    @column("tst_name")
    @required()
    name!: string;

    @column("tst_nif")
    // @unique()
    @minlength(9)
    @maxlength(9)
    @required()
    nif!: string;

    constructor(arg?: ModelArg<TestContextModel>) {
      super(arg);
    }
  }

  let repo: RamRepository<TestContextModel>;

  const singleOps = [
    OperationKeys.CREATE,
    OperationKeys.READ,
    OperationKeys.UPDATE,
    OperationKeys.DELETE,
  ];

  const bulkOps = [
    BulkCrudOperationKeys.CREATE_ALL,
    BulkCrudOperationKeys.READ_ALL,
    BulkCrudOperationKeys.UPDATE_ALL,
    BulkCrudOperationKeys.DELETE_ALL,
  ];

  const transactionals = [
    ...singleOps.filter((o) => o !== OperationKeys.READ),
    ...bulkOps.filter((o) => o !== BulkCrudOperationKeys.READ_ALL),
  ];

  const crudOps = [...singleOps, ...bulkOps];
  const allOps = [
    ...crudOps,
    PersistenceKeys.STATEMENT,
    PreparedStatementKeys.FIND_BY,
    PreparedStatementKeys.LIST_BY,
    PreparedStatementKeys.PAGE_BY,
    PersistenceKeys.QUERY,
    "initialize",
  ];

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = Repository.forModel(TestContextRepoModel);
  });

  describe("adapter", () => {
    const testModel = new TestContextModel({
      id: Date.now(),
      name: "name",
      nif: "123456789",
    });
    const testModelList = new Array(10).fill(0).map(
      (_, i) =>
        new TestContextModel({
          id: i,
          name: "name" + i,
          nif: "123456789",
        })
    );

    let cached: TestContextModel = new TestContextModel({
      id: Date.now(),
      name: "name",
      nif: "123456789",
    });

    let cachedBulk: TestContextModel[];

    crudOps.forEach((op) => {
      it(`Should always expect a context for ${op} operation`, async () => {
        await expect(adapter[op](testModel)).rejects.toThrow(
          "No context provided"
        );
      });

      it(`Should execute ${op} with a context`, async () => {
        const { ctx } = await Adapter.logCtx.call(
          adapter,
          op,
          {},
          true,
          TestContextModel
        );

        let m: TestContextModel | number | number[] | TestContextModel[];
        let args: any[] = [];
        switch (op) {
          case OperationKeys.CREATE:
            m = new TestContextModel(cached);
            args = [m[Model.pk(TestContextModel)], m];
            break;
          case OperationKeys.UPDATE:
            m = new TestContextModel({ ...cached, name: "updated" });
            args = [m[Model.pk(TestContextModel)], m];
            break;
          case BulkCrudOperationKeys.CREATE_ALL:
            m = testModelList;
            args = [m.map((m) => m[Model.pk(TestContextModel)]), m];
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
            m = cachedBulk.map(
              (m) => new TestContextModel({ ...m, name: "updated" })
            );
            args = [cachedBulk.map((m) => m[Model.pk(TestContextModel)]), m];
            break;
          case BulkCrudOperationKeys.READ_ALL:
            m = cachedBulk;
            args = [m.map((m) => m[Model.pk(TestContextModel)])];
            break;
          case BulkCrudOperationKeys.DELETE_ALL:
            args = [cachedBulk.map((m) => m[Model.pk(TestContextModel)])];
            break;
          default:
            m = cached;
            args = [m[Model.pk(TestContextModel)]];
        }

        const current = await adapter[op](TestContextModel, ...args, ctx);

        switch (op) {
          case OperationKeys.UPDATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextModel);
            expect(current.equals(cached)).toBe(false);
          // eslint-disable-next-line no-fallthrough
          case OperationKeys.CREATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextModel);
            expect(current.hasErrors()).toBeUndefined();
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
          case BulkCrudOperationKeys.CREATE_ALL:
          case BulkCrudOperationKeys.READ_ALL:
          case BulkCrudOperationKeys.DELETE_ALL:
            expect(current).toBeDefined();
            expect(
              current.every(
                (c) => c instanceof TestContextModel && !c.hasErrors()
              )
            ).toBeTruthy();
            break;
          default:
            expect(
              Array.isArray(current)
                ? current.find((c) => c.hasErrors())
                : current.hasErrors()
            ).toBeUndefined();
            break;
        }

        if (bulkOps.includes(op as any)) {
          cachedBulk = current;
        } else {
          cached = current;
        }
      });
    });
  });

  describe("repository", () => {
    let observer: Observer;
    let mock: any;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
      jest.resetAllMocks();
      mock = jest.fn();
      observer = new (class implements Observer {
        refresh(...args: any[]): Promise<void> {
          return mock(...args);
        }
      })();
      repo.observe(observer);
    });

    afterEach(() => {
      repo.unObserve(observer);
    });

    const testModel = new TestContextRepoModel({
      name: "name",
      nif: "123456789",
    });
    const testModelList = new Array(10).fill(0).map(
      (_, i) =>
        new TestContextRepoModel({
          name: "name" + i,
          nif: "123456789",
        })
    );

    let cached: TestContextRepoModel = new TestContextRepoModel({
      name: "name",
      nif: "123456789",
    });

    let cachedBulk: TestContextRepoModel[];

    crudOps.forEach((op) => {
      let ctx: RamContext;

      beforeEach(async () => {});

      it(`Should run ${op} operation without being given a context`, async () => {
        let m:
          | TestContextRepoModel
          | number
          | number[]
          | TestContextRepoModel[];
        let args: any[] = [];
        switch (op) {
          case OperationKeys.CREATE:
            m = new TestContextRepoModel(cached);
            args = [m];
            break;
          case OperationKeys.UPDATE:
            m = new TestContextRepoModel({ ...cached, name: "updated" });
            args = [m];
            break;
          case BulkCrudOperationKeys.CREATE_ALL:
            m = testModelList;
            args = [m];
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
            m = cachedBulk.map(
              (m) => new TestContextRepoModel({ ...m, name: "updated" })
            );
            args = [m];
            break;
          case BulkCrudOperationKeys.READ_ALL:
            m = cachedBulk;
            args = [m.map((m) => m[Model.pk(TestContextRepoModel)])];
            break;
          case BulkCrudOperationKeys.DELETE_ALL:
            args = [cachedBulk.map((m) => m[Model.pk(TestContextRepoModel)])];
            break;
          default:
            m = cached;
            args = [m[Model.pk(TestContextRepoModel)]];
        }

        const current = await repo[op](...args);

        switch (op) {
          case OperationKeys.UPDATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextRepoModel);
            expect(current.equals(cached)).toBe(false);
          // eslint-disable-next-line no-fallthrough
          case OperationKeys.CREATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextRepoModel);
            expect(current.hasErrors()).toBeUndefined();
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
          case BulkCrudOperationKeys.CREATE_ALL:
          case BulkCrudOperationKeys.READ_ALL:
          case BulkCrudOperationKeys.DELETE_ALL:
            expect(current).toBeDefined();
            expect(
              current.every(
                (c) => c instanceof TestContextRepoModel && !c.hasErrors()
              )
            ).toBeTruthy();
            break;
          default:
            expect(
              Array.isArray(current)
                ? current.find((c) => c.hasErrors())
                : current.hasErrors()
            ).toBeUndefined();
            break;
        }

        if (bulkOps.includes(op as any)) {
          cachedBulk = current;
        } else {
          cached = current;
        }
      });

      it.skip(`Should execute ${op} even when provided a different context`, async () => {
        let m:
          | TestContextRepoModel
          | number
          | number[]
          | TestContextRepoModel[];

        const ctx = new Context();

        let args: any[] = [];
        switch (op) {
          case OperationKeys.CREATE:
            m = new TestContextRepoModel(cached);
            args = [m];
            break;
          case OperationKeys.UPDATE:
            m = new TestContextRepoModel({ ...cached, name: "updated" });
            args = [m];
            break;
          case BulkCrudOperationKeys.CREATE_ALL:
            m = testModelList;
            args = [m];
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
            m = cachedBulk.map(
              (m) => new TestContextRepoModel({ ...m, name: "updated" })
            );
            args = [m];
            break;
          case BulkCrudOperationKeys.READ_ALL:
            m = cachedBulk;
            args = [m.map((m) => m[Model.pk(TestContextRepoModel)])];
            break;
          case BulkCrudOperationKeys.DELETE_ALL:
            args = [cachedBulk.map((m) => m[Model.pk(TestContextRepoModel)])];
            break;
          default:
            m = cached;
            args = [m[Model.pk(TestContextRepoModel)]];
        }

        const current = await repo[op](...args, ctx);

        switch (op) {
          case OperationKeys.UPDATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextRepoModel);
            expect(current.equals(cached)).toBe(false);
          // eslint-disable-next-line no-fallthrough
          case OperationKeys.CREATE:
            expect(current).toBeDefined();
            expect(current).toBeInstanceOf(TestContextRepoModel);
            expect(current.hasErrors()).toBeUndefined();
            break;
          case BulkCrudOperationKeys.UPDATE_ALL:
          case BulkCrudOperationKeys.CREATE_ALL:
          case BulkCrudOperationKeys.READ_ALL:
          case BulkCrudOperationKeys.DELETE_ALL:
            expect(current).toBeDefined();
            expect(
              current.every(
                (c) => c instanceof TestContextRepoModel && !c.hasErrors()
              )
            ).toBeTruthy();
            break;
          default:
            expect(
              Array.isArray(current)
                ? current.find((c) => c.hasErrors())
                : current.hasErrors()
            ).toBeUndefined();
            break;
        }

        if (bulkOps.includes(op as any)) {
          cachedBulk = current;
        } else {
          cached = current;
        }
      });
    });
  });
});
