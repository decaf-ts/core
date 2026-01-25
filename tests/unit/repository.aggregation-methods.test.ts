import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  column,
  pk,
  table,
} from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { Repository } from "../../src/repository/Repository";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { PreparedStatementKeys } from "../../src/query/constants";

Adapter.setCurrent("ram");

@uses("ram")
@table("aggregation_test_model")
@model()
class AggregationTestModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("score")
  score!: number;

  @column("category")
  category!: string;

  constructor() {
    super();
  }
}

class AggregationTestRepository extends Repository<
  AggregationTestModel,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    super(adapter, AggregationTestModel);
  }
}

describe("Repository - Aggregation Methods", () => {
  let adapter: RamAdapter;
  let repo: AggregationTestRepository;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new AggregationTestRepository(adapter);

    // Create test data
    const models = [
      new AggregationTestModel(),
      new AggregationTestModel(),
      new AggregationTestModel(),
      new AggregationTestModel(),
      new AggregationTestModel(),
    ];

    models[0].id = "1";
    models[0].name = "Item A";
    models[0].score = 10;
    models[0].category = "Electronics";

    models[1].id = "2";
    models[1].name = "Item B";
    models[1].score = 20;
    models[1].category = "Electronics";

    models[2].id = "3";
    models[2].name = "Item C";
    models[2].score = 30;
    models[2].category = "Clothing";

    models[3].id = "4";
    models[3].name = "Item D";
    models[3].score = 40;
    models[3].category = "Clothing";

    models[4].id = "5";
    models[4].name = "Item E";
    models[4].score = 50;
    models[4].category = "Books";

    await repo.createAll(models);
  });

  afterAll(async () => {
    await repo.deleteAll(["1", "2", "3", "4", "5"]);
  });

  describe("countOf", () => {
    it("should count all records", async () => {
      const count = await repo.countOf();
      expect(count).toBe(5);
    });

    it("should count with a specific field", async () => {
      const count = await repo.countOf("score" as any);
      expect(count).toBe(5);
    });
  });

  describe("maxOf", () => {
    it("should find maximum value", async () => {
      const max = await repo.maxOf("score" as any);
      expect(max).toBe(50);
    });
  });

  describe("minOf", () => {
    it("should find minimum value", async () => {
      const min = await repo.minOf("score" as any);
      expect(min).toBe(10);
    });
  });

  describe("avgOf", () => {
    it("should calculate average", async () => {
      const avg = await repo.avgOf("score" as any);
      // (10 + 20 + 30 + 40 + 50) / 5 = 30
      expect(avg).toBe(30);
    });
  });

  describe("sumOf", () => {
    it("should calculate sum", async () => {
      const sum = await repo.sumOf("score" as any);
      // 10 + 20 + 30 + 40 + 50 = 150
      expect(sum).toBe(150);
    });
  });

  describe("distinctOf", () => {
    it("should find distinct values", async () => {
      const distinct = await repo.distinctOf("category" as any);
      expect(distinct.sort()).toEqual(["Books", "Clothing", "Electronics"]);
    });
  });

  describe("groupOf", () => {
    it("should group records", async () => {
      const grouped = await repo.groupOf("category" as any);
      expect(Object.keys(grouped).sort()).toEqual([
        "Books",
        "Clothing",
        "Electronics",
      ]);
      expect(grouped.Electronics).toHaveLength(2);
      expect(grouped.Clothing).toHaveLength(2);
      expect(grouped.Books).toHaveLength(1);
    });
  });

  describe("PreparedStatementKeys", () => {
    it("should have all new aggregation keys", () => {
      expect(PreparedStatementKeys.COUNT_OF).toBe("countOf");
      expect(PreparedStatementKeys.MAX_OF).toBe("maxOf");
      expect(PreparedStatementKeys.MIN_OF).toBe("minOf");
      expect(PreparedStatementKeys.AVG_OF).toBe("avgOf");
      expect(PreparedStatementKeys.SUM_OF).toBe("sumOf");
      expect(PreparedStatementKeys.DISTINCT_OF).toBe("distinctOf");
      expect(PreparedStatementKeys.GROUP_OF).toBe("groupOf");
    });
  });

  describe("statement method with new aggregation keys", () => {
    it("should be able to call aggregation methods via statement()", async () => {
      // Call countOf directly to verify it works
      const directCount = await repo.countOf();
      expect(directCount).toBe(5);
    });

    it("should be able to call maxOf via statement()", async () => {
      const max = await repo.statement("maxOf", "score");
      expect(max).toBe(50);
    });

    it("should be able to call minOf via statement()", async () => {
      const min = await repo.statement("minOf", "score");
      expect(min).toBe(10);
    });

    it("should be able to call avgOf via statement()", async () => {
      const avg = await repo.statement("avgOf", "score");
      expect(avg).toBe(30);
    });

    it("should be able to call sumOf via statement()", async () => {
      const sum = await repo.statement("sumOf", "score");
      expect(sum).toBe(150);
    });

    it("should be able to call distinctOf via statement()", async () => {
      const distinct = (await repo.statement(
        "distinctOf",
        "category"
      )) as string[];
      expect(distinct.sort()).toEqual(["Books", "Clothing", "Electronics"]);
    });

    it("should be able to call groupOf via statement()", async () => {
      const grouped = (await repo.statement("groupOf", "category")) as Record<
        string,
        AggregationTestModel[]
      >;
      expect(Object.keys(grouped).sort()).toEqual([
        "Books",
        "Clothing",
        "Electronics",
      ]);
    });
  });
});
