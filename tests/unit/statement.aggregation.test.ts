import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { BaseModel, column, pk, table } from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { Repository } from "../../src/repository/Repository";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { Condition } from "../../src/query/Condition";
Adapter.setCurrent("ram");

@uses("ram")
@table("statement_aggregation_test")
@model()
class StatementAggregationTestModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("value")
  value!: number;

  @column("category")
  category!: string;

  constructor() {
    super();
  }
}

class StatementAggregationTestRepository extends Repository<
  StatementAggregationTestModel,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    super(adapter, StatementAggregationTestModel);
  }
}

describe("Statement - Aggregation Squash and Prepare", () => {
  let adapter: RamAdapter;
  let repo: StatementAggregationTestRepository;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new StatementAggregationTestRepository(adapter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("squash() for simple aggregations", () => {
    it("should squash simple count query to countOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(5);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .count()
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("countOf");
    });

    it("should squash count with field to countOf with field arg", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(5);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .count("value" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("countOf");
      expect(callArgs[1]).toBe("value");
    });

    it("should squash simple max query to maxOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(100);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .max("value" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("maxOf");
      expect(callArgs[1]).toBe("value");
    });

    it("should squash simple min query to minOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(1);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .min("value" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("minOf");
      expect(callArgs[1]).toBe("value");
    });

    it("should squash simple avg query to avgOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(50);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .avg("value" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("avgOf");
      expect(callArgs[1]).toBe("value");
    });

    it("should squash simple sum query to sumOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(500);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .sum("value" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("sumOf");
      expect(callArgs[1]).toBe("value");
    });

    it("should squash simple distinct query to distinctOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce(["A", "B", "C"]);

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .distinct("category" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("distinctOf");
      expect(callArgs[1]).toBe("category");
    });

    it("should squash simple groupBy query to groupOf", async () => {
      const statementSpy = jest
        .spyOn(repo as any, "statement")
        .mockResolvedValueOnce({ A: [], B: [] });

      await repo
        .override({
          forcePrepareSimpleQueries: true,
        })
        .select()
        .groupBy("category" as any)
        .execute();

      expect(statementSpy).toHaveBeenCalledTimes(1);
      const callArgs = statementSpy.mock.calls[0];
      expect(callArgs[0]).toBe("groupOf");
      expect(callArgs[1]).toBe("category");
    });
  });

  describe("should NOT squash aggregations with where conditions", () => {
    it("should not squash count with where to countOf", async () => {
      const rawSpy = jest.spyOn(adapter, "raw").mockResolvedValueOnce(3);
      const statementSpy = jest.spyOn(repo as any, "statement");

      await repo
        .override({
          allowRawStatements: true,
          forcePrepareSimpleQueries: true,
        })
        .count()
        .where(Condition.attr<StatementAggregationTestModel>("value").gt(10))
        .execute();

      // Should use raw execution since aggregation with where can't be squashed to simple method
      expect(rawSpy).toHaveBeenCalled();
      expect(statementSpy).not.toHaveBeenCalled();
    });

    it("should not squash multi-level groupBy to simple groupOf", async () => {
      const rawSpy = jest.spyOn(adapter, "raw").mockResolvedValueOnce({});
      const statementSpy = jest.spyOn(repo as any, "statement");

      await repo
        .override({
          allowRawStatements: true,
          forcePrepareSimpleQueries: true,
        })
        .select()
        .groupBy("category" as any)
        .thenBy("name" as any)
        .execute();

      // Multi-level groupBy can't be squashed to simple groupOf
      expect(rawSpy).toHaveBeenCalled();
      expect(statementSpy).not.toHaveBeenCalled();
    });
  });

  describe("prepare() generates correct method names", () => {
    it("should generate countByField method name", async () => {
      const stmt = repo
        .override({
          forcePrepareComplexQueries: true,
        })
        .count("value" as any);

      // Trigger prepare through contextual args processing
      const ctx = await adapter.context(
        "test",
        {},
        StatementAggregationTestModel
      );
      await (stmt as any).prepare(ctx);
      const prepared = (stmt as any).prepared;

      expect(prepared.method).toMatch(/^countBy/i);
    });

    it("should generate sumByField method name", async () => {
      const stmt = repo
        .override({
          forcePrepareComplexQueries: true,
        })
        .sum("value" as any);

      const ctx = await adapter.context(
        "test",
        {},
        StatementAggregationTestModel
      );
      await (stmt as any).prepare(ctx);
      const prepared = (stmt as any).prepared;

      expect(prepared.method).toMatch(/^sumBy/i);
    });

    it("should generate findByConditionGroupBy method name", async () => {
      const stmt = repo
        .override({
          forcePrepareComplexQueries: true,
        })
        .select()
        .where(Condition.attr<StatementAggregationTestModel>("name").eq("test"))
        .groupBy("category" as any);

      const ctx = await adapter.context(
        "test",
        {},
        StatementAggregationTestModel
      );
      await (stmt as any).prepare(ctx);
      const prepared = (stmt as any).prepared;

      expect(prepared.method).toMatch(/findBy.*GroupBy/i);
    });
  });
});
