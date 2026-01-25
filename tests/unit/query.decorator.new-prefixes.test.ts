import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { BaseModel, column, pk, query, table, OrderDirection } from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { Repository } from "../../src/repository/Repository";
import { RamAdapter } from "../../src/ram/RamAdapter";

Adapter.setCurrent("ram");

@uses("ram")
@table("query_decorator_test_model")
@model()
class QueryDecoratorTestModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("age")
  age!: number;

  @column("country")
  country!: string;

  @column("active")
  active!: boolean;

  constructor() {
    super();
  }
}

class QueryDecoratorTestRepository extends Repository<
  QueryDecoratorTestModel,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    super(adapter, QueryDecoratorTestModel);
  }

  @query()
  async countByAge() {
    // Will be replaced by decorator
    return 0;
  }

  @query()
  async sumByAge() {
    return 0;
  }

  @query()
  async avgByAge() {
    return 0;
  }

  @query()
  async minByAge() {
    return 0;
  }

  @query()
  async maxByAge() {
    return 0;
  }

  @query()
  async distinctByCountry() {
    return [];
  }

  @query()
  async groupByCountry() {
    return {};
  }

  @query()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByActiveGroupByCountry(active: boolean) {
    return {};
  }

  @query()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByNameEqualsGroupByCountryThenByActive(name: string) {
    return {};
  }

  @query()
  async pageByNameEqualsOrderByAge(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    direction: OrderDirection,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pageSize: number
  ) {
    return null;
  }
}

describe("@query decorator - New Prefixes", () => {
  let adapter: RamAdapter;
  let repo: QueryDecoratorTestRepository;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = new QueryDecoratorTestRepository(adapter);

    // Create test data
    const models = [
      new QueryDecoratorTestModel(),
      new QueryDecoratorTestModel(),
      new QueryDecoratorTestModel(),
      new QueryDecoratorTestModel(),
      new QueryDecoratorTestModel(),
    ];

    models[0].id = "1";
    models[0].name = "Alice";
    models[0].age = 25;
    models[0].country = "USA";
    models[0].active = true;

    models[1].id = "2";
    models[1].name = "Bob";
    models[1].age = 30;
    models[1].country = "USA";
    models[1].active = false;

    models[2].id = "3";
    models[2].name = "Charlie";
    models[2].age = 35;
    models[2].country = "UK";
    models[2].active = true;

    models[3].id = "4";
    models[3].name = "Diana";
    models[3].age = 40;
    models[3].country = "UK";
    models[3].active = true;

    models[4].id = "5";
    models[4].name = "Eve";
    models[4].age = 45;
    models[4].country = "Canada";
    models[4].active = false;

    await repo.createAll(models);
  });

  afterAll(async () => {
    await repo.deleteAll(["1", "2", "3", "4", "5"]);
  });

  describe("countBy", () => {
    it("should count records with countByAge", async () => {
      const count = await repo.countByAge();
      expect(count).toBe(5);
    });
  });

  describe("sumBy", () => {
    it("should sum values with sumByAge", async () => {
      const sum = await repo.sumByAge();
      // 25 + 30 + 35 + 40 + 45 = 175
      expect(sum).toBe(175);
    });
  });

  describe("avgBy", () => {
    it("should average values with avgByAge", async () => {
      const avg = await repo.avgByAge();
      // 175 / 5 = 35
      expect(avg).toBe(35);
    });
  });

  describe("minBy", () => {
    it("should find minimum with minByAge", async () => {
      const min = await repo.minByAge();
      expect(min).toBe(25);
    });
  });

  describe("maxBy", () => {
    it("should find maximum with maxByAge", async () => {
      const max = await repo.maxByAge();
      expect(max).toBe(45);
    });
  });

  describe("distinctBy", () => {
    it("should find distinct values with distinctByCountry", async () => {
      const distinct = await repo.distinctByCountry();
      expect(distinct.sort()).toEqual(["Canada", "UK", "USA"]);
    });
  });

  describe("groupBy", () => {
    it("should group records with groupByCountry", async () => {
      const grouped: any = await repo.groupByCountry();
      expect(Object.keys(grouped).sort()).toEqual(["Canada", "UK", "USA"]);
      expect(grouped.USA).toHaveLength(2);
      expect(grouped.UK).toHaveLength(2);
      expect(grouped.Canada).toHaveLength(1);
    });
  });

  describe("findBy with GroupBy", () => {
    it("should filter and group with findByActiveGroupByCountry", async () => {
      const grouped: any = await repo.findByActiveGroupByCountry(true);
      // Active users: Alice (USA), Charlie (UK), Diana (UK)
      expect(Object.keys(grouped).sort()).toEqual(["UK", "USA"]);
      expect(grouped.USA).toHaveLength(1);
      expect(grouped.UK).toHaveLength(2);
    });

    it("should filter and multi-level group with findByNameEqualsGroupByCountryThenByActive", async () => {
      // This query filters by name, then groups by country, then by active
      // Since we're filtering by a specific name, we need to adjust expectations
      const grouped: any =
        await repo.findByNameEqualsGroupByCountryThenByActive("Alice");
      // Only Alice matches, grouped by country (USA) then by active (true)
      expect(grouped.USA).toBeDefined();
      expect(grouped.USA.true).toBeDefined();
      expect(grouped.USA.true).toHaveLength(1);
    });
  });

  describe("pageBy", () => {
    it("should paginate with pageByNameEqualsOrderByAge", async () => {
      const paginator = await repo.pageByNameEqualsOrderByAge(
        "Alice",
        OrderDirection.ASC,
        10
      );
      expect(paginator).toBeDefined();
      // Check that it returns a paginator with expected methods
      expect(typeof paginator.page).toBe("function");
    });
  });
});
