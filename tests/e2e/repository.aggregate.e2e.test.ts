/* eslint-disable @typescript-eslint/no-unused-vars */
import { E2eConfig } from "./e2e.config";
import { Repo, Repository } from "../../src/repository/Repository";
import { Context, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { generateGtin } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Observer, OrderDirection } from "../../src/index";
import { Logging, LogLevel, style } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
import { Condition } from "../../src/query/Condition";
import { QueryError } from "../../src/query/errors";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository aggregate operations test", () => {
  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Product>;
  let observer: Observer;
  let mock: jest.Func;
  let contextFactoryMock: jest.SpyInstance;
  let bulk: Product[];

  beforeAll(async () => {
    adapter = await adapterFactory();
    repo = Repository.forModel(Clazz);
  });

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

    const adapterContextFactory = adapter.context.bind(adapter);
    contextFactoryMock = jest
      .spyOn(adapter, "context")
      .mockImplementation(
        (
          op: string,
          overrides: Partial<any>,
          model: Constructor,
          ...args: any[]
        ) => {
          const log = logger
            .for(style("adapter context factory").green.bold)
            .for(expect.getState().currentTestName);
          try {
            log.info(
              `adapter context called with ${op}, ${JSON.stringify(overrides)}, ${model ? `name ${model.name}, ` : ""}${JSON.stringify(args)}`
            );
          } catch (e: unknown) {
            log.warn(
              `adapter context called with ${op}, ${model ? `name ${model.name}, ` : ""}, and not stringifyable args or overrides`
            );
          }
          return adapterContextFactory(op, overrides, model, ...args);
        }
      );
  });

  afterEach(() => {
    repo.unObserve(observer);
  });

  describe("COUNT operations", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("counts all records with count()", async () => {
      const count = await repo.count().execute();
      expect(count).toBe(10);
    });

    it("counts non-null values with count(field)", async () => {
      const count = await repo.count("nameMedicinalProduct" as any).execute();
      expect(count).toBe(10); // All records have nameMedicinalProduct
    });

    it("counts with where condition", async () => {
      const count = await repo
        .count()
        .where(Condition.attr<Product>("counter" as any).gt(5))
        .execute();
      expect(count).toBe(4); // counters 6, 7, 8, 9
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("MIN operations", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index * 10, // 0, 10, 20, ..., 90
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("finds minimum value of a number field", async () => {
      const min = await repo.min("counter" as any).execute();
      expect(min).toBe(0);
    });

    it("finds minimum with where condition", async () => {
      const min = await repo
        .min("counter" as any)
        .where(Condition.attr<Product>("counter" as any).gt(20))
        .execute();
      expect(min).toBe(30);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("MAX operations", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index * 10, // 0, 10, 20, ..., 90
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("finds maximum value of a number field", async () => {
      const max = await repo.max("counter" as any).execute();
      expect(max).toBe(90);
    });

    it("finds maximum with where condition", async () => {
      const max = await repo
        .max("counter" as any)
        .where(Condition.attr<Product>("counter" as any).lt(60))
        .execute();
      expect(max).toBe(50);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("SUM operations", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("sums values of a number field", async () => {
      const sum = await repo.sum("counter" as any).execute();
      expect(sum).toBe(45);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("AVG operations", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("averages values of a number field", async () => {
      const avg = await repo.avg("counter" as any).execute();
      expect(avg).toBeCloseTo(4.5);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("DATE min/max operations", () => {
    const launchDates: Date[] = [];

    beforeAll(async () => {
      const models = new Array(5).fill(0).map((_, index) => {
        const id = generateGtin();
        const date = new Date(2024, 0, index + 1);
        launchDates.push(date);
        return new Product({
          productCode: id,
          inventedName: "name-date-" + index,
          nameMedicinalProduct: "medicine-date-" + index,
          counter: index,
          strengths: [],
          markets: [],
          launchDate: date,
        });
      });
      bulk = await repo.createAll(models);
    });

    it("finds the earliest launch date", async () => {
      const min = await repo.min("launchDate" as any).execute();
      expect(min).toEqual(launchDates[0]);
    });

    it("finds the latest launch date", async () => {
      const max = await repo.max("launchDate" as any).execute();
      expect(max).toEqual(launchDates[launchDates.length - 1]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("DISTINCT operations", () => {
    beforeAll(async () => {
      const models = [];
      // Create records with duplicate values
      for (let i = 0; i < 10; i++) {
        const id = generateGtin();
        models.push(
          new Product({
            productCode: id,
            inventedName: "name" + (i % 3), // Only 3 distinct values: name0, name1, name2
            nameMedicinalProduct: "medicine" + i,
            counter: i,
            strengths: [],
            markets: [],
          })
        );
      }
      bulk = await repo.createAll(models);
    });

    it("finds distinct values of a field", async () => {
      const distinct = await repo.distinct("inventedName" as any).execute();
      expect(distinct).toBeDefined();
      expect(Array.isArray(distinct)).toBe(true);
      expect(distinct.length).toBe(3);
      expect(distinct.sort()).toEqual(["name0", "name1", "name2"]);
    });

    it("finds distinct values with where condition", async () => {
      const distinct = await repo
        .distinct("inventedName" as any)
        .where(Condition.attr<Product>("counter" as any).lt(6))
        .execute();
      expect(distinct).toBeDefined();
      expect(Array.isArray(distinct)).toBe(true);
      // counter 0,1,2,3,4,5 -> name0, name1, name2, name0, name1, name2
      expect(distinct.length).toBe(3);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("BETWEEN condition", () => {
    beforeAll(async () => {
      const models = new Array(20).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index, // 0 to 19
          strengths: [],
          markets: [],
          launchDate: new Date(2024, 0, index + 1),
        });
      });
      bulk = await repo.createAll(models);
    });

    it("filters records with BETWEEN condition", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).between(5, 10))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(6); // 5, 6, 7, 8, 9, 10
      expect(results.map((r) => r.counter)).toEqual([5, 6, 7, 8, 9, 10]);
    });

    it("handles BETWEEN with single value range", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).between(7, 7))
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].counter).toBe(7);
    });

    it("filters records between date values", async () => {
      const start = new Date(2024, 0, 5);
      const end = new Date(2024, 0, 10);
      const results = await repo
        .select()
        .where(
          Condition.attr<Product>("launchDate" as any).between(start, end)
        )
        .orderBy(["launchDate", OrderDirection.ASC])
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(6);
      expect(results[0].launchDate).toEqual(start);
      expect(results[results.length - 1].launchDate).toEqual(end);
    });

    it("throws when BETWEEN is used on non-numeric/date fields", async () => {
      await expect(
        repo
          .select()
          .where(
            Condition.attr<Product>("inventedName" as any).between("a", "z")
          )
          .execute()
      ).rejects.toBeInstanceOf(QueryError);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("IN condition", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("filters records with IN condition", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).in([2, 5, 7]))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(3);
      expect(results.map((r) => r.counter)).toEqual([2, 5, 7]);
    });

    it("handles IN with empty array", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).in([]))
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(0);
    });

    it("handles IN with single value", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).in([5]))
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(1);
      expect(results[0].counter).toBe(5);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("Complex aggregate queries", () => {
    beforeAll(async () => {
      const models = new Array(20).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + (index % 5),
          nameMedicinalProduct: "medicine" + index,
          counter: index * 2, // 0, 2, 4, ..., 38
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("combines BETWEEN with aggregate functions", async () => {
      const count = await repo
        .count()
        .where(Condition.attr<Product>("counter" as any).between(10, 20))
        .execute();

      expect(count).toBe(6); // 10, 12, 14, 16, 18, 20
    });

    it("combines IN with MIN", async () => {
      const min = await repo
        .min("counter" as any)
        .where(Condition.attr<Product>("counter" as any).in([10, 20, 30]))
        .execute();

      expect(min).toBe(10);
    });

    it("combines IN with MAX", async () => {
      const max = await repo
        .max("counter" as any)
        .where(Condition.attr<Product>("counter" as any).in([10, 20, 30]))
        .execute();

      expect(max).toBe(30);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });
});
