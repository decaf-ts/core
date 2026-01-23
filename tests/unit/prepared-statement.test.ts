import { minlength, model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { RamAdapter } from "../../src/ram/RamAdapter";
import {
  BaseModel,
  pk,
  Repository,
  OrderDirection,
  QueryError,
} from "../../src/index";
import type { RamRepository } from "../../src/ram/types";
import { uses } from "@decaf-ts/decoration";

jest.setTimeout(50000);

describe("prepared statements", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: RamAdapter;

  beforeAll(async () => {
    adapter = new RamAdapter();
  });

  @uses("ram")
  @model()
  class TestBulkModel extends BaseModel {
    @pk({ type: Number })
    id?: number = undefined;

    @required()
    @minlength(5)
    attr1?: string = undefined;

    constructor(arg?: ModelArg<TestBulkModel>) {
      super(arg);
    }
  }

  let created: TestBulkModel[];

  it("Creates in bulk", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);
    const models = [1].map(
      (i) =>
        new TestBulkModel({
          attr1: "user_name_" + i,
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestBulkModel)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("executes default prepared statements", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    const res1 = await repo.listBy("attr1", OrderDirection.DSC);

    const res2 = await repo.statement("listBy", "attr1", "desc");

    expect(res1).toEqual(res2);

    const res11 = await repo.paginateBy("attr1", OrderDirection.DSC, {
      offset: 1,
      limit: 5,
    });

    const res22 = await repo.statement("paginateBy", "attr1", "desc", {
      limit: 5,
      offset: 1,
    });

    expect(JSON.parse(JSON.stringify(res11))).toEqual(
      JSON.parse(JSON.stringify(res22))
    );

    const page1 = res11.data;
    const page11 = res22.data;

    expect(page1).toEqual(page11);
  });

  it("fails for unprepared statements", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const res1 = await repo.select().execute();

    await expect(repo.statement("select")).rejects.toThrowError(QueryError);
  });

  it("prepares in the statement itself", async () => {
    const repo: RamRepository<TestBulkModel> = Repository.forModel<
      TestBulkModel,
      RamRepository<TestBulkModel>
    >(TestBulkModel);

    const prepared = await repo.select().prepare();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await prepared.execute();

    await expect(repo.statement("select")).rejects.toThrowError(QueryError);
  });
});
