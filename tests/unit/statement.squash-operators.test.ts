import { it } from "@decaf-ts/for-testing";
/* eslint-disable @typescript-eslint/no-unused-vars */
import { model, required, Model } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { RamAdapter } from "../../src/ram/RamAdapter";
import {
  BaseModel,
  Condition,
  DirectionLimitOffset,
  OrderDirection,
  pk,
  query,
  QueryError,
  Repository,
  column,
  index,
} from "../../src/index";
import type { RamRepository } from "../../src/ram/types";

@uses("ram")
@model()
class SquashOperatorModel extends BaseModel {
  @pk({ type: Number })
  id?: number = undefined;

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  score?: number = undefined;

  constructor(arg?: ModelArg<SquashOperatorModel>) {
    super(arg);
  }
}

// declares the operator-aware statements so forced preparation can execute them
class SquashOperatorRepo extends Repository<SquashOperatorModel, any> {
  constructor(adapter: any) {
    super(adapter, SquashOperatorModel);
  }

  @query()
  async findByScoreBiggerOrderByScore(
    score: number,
    direction: OrderDirection,
    params?: DirectionLimitOffset
  ): Promise<SquashOperatorModel[]> {
    throw new Error("replaced by @query");
  }

  @query()
  async findByScoreBiggerThanEqualOrderByScore(
    score: number,
    direction: OrderDirection,
    params?: DirectionLimitOffset
  ): Promise<SquashOperatorModel[]> {
    throw new Error("replaced by @query");
  }
}

describe("prepared statement squashing keeps the where operator", () => {
  let repo: RamRepository<SquashOperatorModel>;
  let declared: SquashOperatorRepo;
  const scores = [10, 20, 30, 40, 50];

  beforeAll(async () => {
    const adapter = new RamAdapter();
    declared = new SquashOperatorRepo(adapter);
    repo = Repository.forModel<
      SquashOperatorModel,
      RamRepository<SquashOperatorModel>
    >(SquashOperatorModel);
    await repo.createAll(
      scores.map((score) => new SquashOperatorModel({ score }))
    );
  });

  const attr = () => Condition.attribute<SquashOperatorModel>("score");
  const cases: [string, () => Condition<SquashOperatorModel>, number[]][] = [
    ["eq", () => attr().eq(30), [30]],
    ["dif", () => attr().dif(30), [10, 20, 40, 50]],
    ["gt", () => attr().gt(30), [40, 50]],
    ["gte", () => attr().gte(30), [30, 40, 50]],
    ["lt", () => attr().lt(30), [10, 20]],
    ["lte", () => attr().lte(30), [10, 20, 30]],
    ["in", () => attr().in([10, 50]), [10, 50]],
  ];

  const run = async (
    where: Condition<SquashOperatorModel>,
    flags: Record<string, boolean>,
    target: Repository<SquashOperatorModel, any> = repo
  ) => {
    const results = await target
      .override(flags as any)
      .select()
      .where(where)
      .orderBy(["score", OrderDirection.ASC])
      .execute();
    return (results as SquashOperatorModel[]).map((m) => m.score);
  };

  // forced preparation either returns the right rows or refuses an undeclared statement;
  // it must never answer a non-equality query with equality matches
  const forced = async (
    where: Condition<SquashOperatorModel>,
    flags: Record<string, boolean>
  ) => {
    try {
      return await run(where, flags);
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(QueryError);
      expect((e as Error).message).toMatch(/Invalid prepared statement/);
      return "refused";
    }
  };

  for (const [name, where, expected] of cases) {
    it(`${name}: correct raw, never wrong when forced`, async () => {
      expect(await run(where(), {})).toEqual(expected);
      for (const flags of [
        { forcePrepareSimpleQueries: true },
        { forcePrepareComplexQueries: true },
      ]) {
        const result = await forced(where(), flags);
        if (name === "eq") expect(result).toEqual(expected);
        else expect([expected, "refused"]).toContainEqual(result);
      }
    });
  }

  it("executes forced non-equality queries through declared statements", async () => {
    for (const flags of [
      { forcePrepareSimpleQueries: true },
      { forcePrepareComplexQueries: true },
    ]) {
      expect(await run(attr().gt(30), flags, declared)).toEqual([40, 50]);
      expect(await run(attr().gte(30), flags, declared)).toEqual([30, 40, 50]);
    }
  });

  it("still squashes equality into findBy", async () => {
    const statement = repo
      .override({ forcePrepareComplexQueries: true } as any)
      .select()
      .where(attr().eq(30)) as any;
    await statement.prepare();
    expect(statement.prepared?.method).toBe("findBy");
    expect(statement.prepared?.args).toEqual(["score", 30]);
  });

  it("does not squash other operators into an equality findBy", async () => {
    const statement = repo
      .override({ forcePrepareComplexQueries: true } as any)
      .select()
      .where(attr().gt(30)) as any;
    await statement.prepare();
    expect(statement.prepared?.method).not.toBe("findBy");
    expect(statement.prepared?.method).toMatch(/Bigger/);
    expect(statement.prepared?.args).toEqual([30]);
  });

  it("passes the comparison value for gte (bigger than equal)", async () => {
    const statement = repo
      .override({ forcePrepareComplexQueries: true } as any)
      .select()
      .where(attr().gte(30)) as any;
    await statement.prepare();
    expect(statement.prepared?.args).toEqual([30]);
  });
});

// keep the model referenced
expect(Model).toBeDefined();
