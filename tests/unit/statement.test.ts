import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  column,
  DirectionLimitOffset,
  pk,
  prepared,
  table,
  UnsupportedError,
} from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { Condition } from "../../src/query/Condition";
import { OrderDirection } from "../../src/repository/constants";
import { Repository } from "../../src/repository/Repository";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { Context } from "../../src/persistence/Context";

Adapter.setCurrent("ram");

@uses("ram")
@table("statement_test_model")
@model()
class StatementTestModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("age")
  age!: number;

  constructor() {
    super();
  }
}

class StatementTestRepository extends Repository<
  StatementTestModel,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    super(adapter, StatementTestModel);
  }

  @prepared()
  async paginateByAgeBiggerAndName(
    age: number,
    name: string,
    params: DirectionLimitOffset
  ) {
    return await this.override({
      allowRawStatements: true,
      forcePrepareComplexQueries: false,
    })
      .select()
      .where(
        Condition.attr<StatementTestModel>("age")
          .gt(age)
          .and(Condition.attr<StatementTestModel>("name").eq(name))
      )
      .paginate(params.limit);
  }
}

describe("Statement execution strategy", () => {
  let adapter: RamAdapter;
  let repo: StatementTestRepository;

  beforeAll(() => {
    adapter = new RamAdapter();
    repo = new StatementTestRepository(adapter);
    (repo as any)._adapter = adapter;
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    jest.clearAllMocks();
  });

  it("squashes simple queries into prepared findBy when configured", async () => {
    const statementSpy = jest
      .spyOn(repo as any, "statement")
      .mockResolvedValueOnce(["prepared"]);
    const rawSpy = jest.spyOn(adapter, "raw");

    await expect(
      repo
        .select()
        .where(Condition.attr<StatementTestModel>("name").eq("alice"))
        .execute()
    ).resolves.toEqual([]);

    expect(rawSpy).toHaveBeenCalledTimes(1);

    await expect(
      repo
        .override({ allowRawStatements: false })
        .select()
        .where(Condition.attr<StatementTestModel>("name").eq("alice"))
        .execute()
    ).rejects.toThrow(UnsupportedError);

    expect(rawSpy).toHaveBeenCalledTimes(1);

    const result = await repo
      .override({
        forcePrepareSimpleQueries: true,
      })
      .select()
      .where(Condition.attr<StatementTestModel>("name").eq("alice"))
      .execute();

    expect(statementSpy).toHaveBeenCalledTimes(1);
    const callArgs = statementSpy.mock.calls[0];
    expect(callArgs[0]).toBe("findBy");
    expect(callArgs[1]).toBe("name");
    expect(callArgs[2]).toBe("alice");
    expect(callArgs[callArgs.length - 1]).toBeInstanceOf(Context);
    expect(result).toEqual(["prepared"]);
  });

  it("squashes complex queries into prepared statements when configured", async () => {
    const statementSpy = jest
      .spyOn(repo as any, "statement")
      .mockResolvedValueOnce(["prepared"]);
    const rawSpy = jest.spyOn(adapter, "raw");

    await expect(
      repo
        .select()
        .where(
          Condition.attr<StatementTestModel>("name")
            .eq("alice")
            .and(repo.attr("age").gt(10))
        )
        .execute()
    ).resolves.toEqual([]);

    expect(rawSpy).toHaveBeenCalledTimes(1);

    await expect(
      repo
        .override({ allowRawStatements: false })
        .select()
        .where(
          Condition.attr<StatementTestModel>("name")
            .eq("alice")
            .and(repo.attr("age").gt(10))
        )
        .execute()
    ).rejects.toThrow(UnsupportedError);

    expect(rawSpy).toHaveBeenCalledTimes(1);

    const result = await repo
      .override({
        forcePrepareComplexQueries: true,
      })
      .select()
      .where(
        Condition.attr<StatementTestModel>("name")
          .eq("alice")
          .and(repo.attr("age").gt(10))
      )
      .execute();

    expect(statementSpy).toHaveBeenCalledTimes(1);
    const callArgs = statementSpy.mock.calls[0];
    expect(callArgs[0]).toBe("findByNameAndAgeBigger");
    expect(callArgs[1]).toBe("alice");
    expect(callArgs[2]).toBe(10);
    expect(callArgs[callArgs.length - 1]).toBeInstanceOf(Context);
    expect(result).toEqual(["prepared"]);
  });

  it("uses paginateBy for squashed pagination", async () => {
    const repoWithOverrides = repo.override({
      allowRawStatements: false,
      forcePrepareComplexQueries: false,
      forcePrepareSimpleQueries: true,
    });

    // const paginator = { paginate: jest.fn() };
    const statementSpy = jest.spyOn(repoWithOverrides as any, "statement");

    const result = await repoWithOverrides
      .select()
      .orderBy("name", "ASC")
      .thenBy(["age", OrderDirection.DSC])
      .paginate(2);

    const page = await result.page();

    expect(page).toBeDefined();

    expect(statementSpy).toHaveBeenCalledTimes(1);
    expect(statementSpy).toHaveBeenCalledWith(
      "paginateBy",
      "name",
      "asc",
      expect.objectContaining({
        bookmark: undefined,
        limit: 2,
        offset: 1,
      }),
      expect.any(Context)
    );
  });

  it("uses raw execution when raw statements are allowed", async () => {
    const repoWithOverrides = repo.override({
      allowRawStatements: true,
      forcePrepareComplexQueries: false,
      forcePrepareSimpleQueries: false,
    });

    const rawResult = ["raw-result"];
    const rawSpy = jest.spyOn(adapter, "raw").mockResolvedValueOnce(rawResult);
    const statementSpy = jest.spyOn(repo as any, "statement");

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await repoWithOverrides
      .select()
      .where(Condition.attr<StatementTestModel>("age").gt(5))
      .execute();

    expect(statementSpy).not.toHaveBeenCalled();
    expect(rawSpy).toHaveBeenCalledTimes(1);
    expect(rawSpy).toHaveBeenCalledWith(
      {
        from: expect.any(Function),
        where: expect.any(Function),
      },
      true,
      expect.any(Context)
    );
  });

  it("uses prepared statements for paginate when complex statements are allowed", async () => {
    const repoWithOverrides = repo.override({
      allowRawStatements: false,
      forcePrepareComplexQueries: true,
      forcePrepareSimpleQueries: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const prepared = Repository.statements(repo.constructor as any);

    const statementSpy = jest.spyOn(repoWithOverrides as any, "statement");

    const condition = Condition.attr<StatementTestModel>("age")
      .gt(18)
      .and(Condition.attr<StatementTestModel>("name").eq("carol"));

    const page = await repoWithOverrides.select().where(condition).paginate(3);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const result = await page.page();

    expect(statementSpy).toHaveBeenCalledTimes(1);
    expect(statementSpy).toHaveBeenCalledWith(
      "paginateByAgeBiggerAndName",
      18,
      "carol",
      expect.objectContaining({ bookmark: undefined, offset: 1, limit: 3 }),
      expect.any(Context)
    );
  });
});
