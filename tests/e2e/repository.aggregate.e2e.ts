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

  describe("COUNT DISTINCT operations", () => {
    beforeAll(async () => {
      const models = [];
      // Create records with duplicate inventedName values
      for (let i = 0; i < 15; i++) {
        const id = generateGtin();
        models.push(
          new Product({
            productCode: id,
            inventedName: "name" + (i % 5), // Only 5 distinct values: name0-name4
            nameMedicinalProduct: "medicine" + i,
            counter: i,
            strengths: [],
            markets: [],
          })
        );
      }
      bulk = await repo.createAll(models);
    });

    it("counts distinct values of a field", async () => {
      const count = await repo
        .count("inventedName" as any)
        .distinct()
        .execute();
      expect(count).toBe(5);
    });

    it("counts distinct values with where condition", async () => {
      // Only count distinct names where counter < 10
      // counter 0-9 -> name0, name1, name2, name3, name4, name0, name1, name2, name3, name4
      // That's 10 records but only 5 distinct names
      const count = await repo
        .count("inventedName" as any)
        .distinct()
        .where(Condition.attr<Product>("counter" as any).lt(10))
        .execute();
      expect(count).toBe(5);
    });

    it("counts distinct on field with all unique values", async () => {
      // All have different productCodes, so count should equal total records
      const count = await repo
        .count("productCode" as any)
        .distinct()
        .execute();
      expect(count).toBe(15);
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

  describe("DATE min/max/avg operations", () => {
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

    it("finds the average launch date", async () => {
      const avg = await repo.avg("launchDate" as any).execute();
      expect(avg).toBeInstanceOf(Date);
      // Average of Jan 1-5 is Jan 3 (the middle date)
      expect(avg).toEqual(new Date(2024, 0, 3));
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
        .where(Condition.attr<Product>("launchDate" as any).between(start, end))
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

  describe("SELECT with field projection", () => {
    beforeAll(async () => {
      const models = new Array(5).fill(0).map((_, index) => {
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

    it("selects specific fields", async () => {
      const results = await repo
        .select(["inventedName", "counter"] as any)
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(5);
      // Results should have the selected fields
      results.forEach((r: any) => {
        expect(r.inventedName).toBeDefined();
        expect(r.counter).toBeDefined();
      });
    });

    it("selects all fields when no selector provided", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(5);
      expect(results[0].productCode).toBeDefined();
      expect(results[0].inventedName).toBeDefined();
      expect(results[0].nameMedicinalProduct).toBeDefined();
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("LIMIT and OFFSET operations", () => {
    beforeAll(async () => {
      const models = new Array(20).fill(0).map((_, index) => {
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

    it("limits results with limit()", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .limit(5)
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(5);
      expect(results.map((r) => r.counter)).toEqual([0, 1, 2, 3, 4]);
    });

    it("skips results with offset()", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .limit(5)
        .offset(10)
        .execute();

      expect(results).toBeDefined();
      expect(results.length).toBe(5);
      expect(results.map((r) => r.counter)).toEqual([10, 11, 12, 13, 14]);
    });

    it("combines limit and offset for pagination", async () => {
      const page1 = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .limit(5)
        .offset(0)
        .execute();

      const page2 = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .limit(5)
        .offset(5)
        .execute();

      expect(page1.map((r) => r.counter)).toEqual([0, 1, 2, 3, 4]);
      expect(page2.map((r) => r.counter)).toEqual([5, 6, 7, 8, 9]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("ORDER BY operations", () => {
    beforeAll(async () => {
      const models = [
        new Product({
          productCode: generateGtin(),
          inventedName: "alpha",
          nameMedicinalProduct: "med1",
          counter: 30,
          strengths: [],
          markets: [],
        }),
        new Product({
          productCode: generateGtin(),
          inventedName: "beta",
          nameMedicinalProduct: "med2",
          counter: 10,
          strengths: [],
          markets: [],
        }),
        new Product({
          productCode: generateGtin(),
          inventedName: "alpha",
          nameMedicinalProduct: "med3",
          counter: 20,
          strengths: [],
          markets: [],
        }),
        new Product({
          productCode: generateGtin(),
          inventedName: "beta",
          nameMedicinalProduct: "med4",
          counter: 40,
          strengths: [],
          markets: [],
        }),
      ];
      bulk = await repo.createAll(models);
    });

    it("orders by single field ascending", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.map((r) => r.counter)).toEqual([10, 20, 30, 40]);
    });

    it("orders by single field descending", async () => {
      const results = await repo
        .select()
        .orderBy(["counter", OrderDirection.DSC])
        .execute();

      expect(results.map((r) => r.counter)).toEqual([40, 30, 20, 10]);
    });

    it("orders by multiple fields with thenBy()", async () => {
      const results = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.ASC])
        .thenBy(["counter", OrderDirection.ASC])
        .execute();

      // alpha first (counter 20, 30), then beta (counter 10, 40)
      expect(results.map((r) => r.inventedName)).toEqual([
        "alpha",
        "alpha",
        "beta",
        "beta",
      ]);
      expect(results.map((r) => r.counter)).toEqual([20, 30, 10, 40]);
    });

    it("orders by multiple fields with mixed directions", async () => {
      const results = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.DSC])
        .thenBy(["counter", OrderDirection.ASC])
        .execute();

      // beta first (counter 10, 40), then alpha (counter 20, 30)
      expect(results.map((r) => r.inventedName)).toEqual([
        "beta",
        "beta",
        "alpha",
        "alpha",
      ]);
      expect(results.map((r) => r.counter)).toEqual([10, 40, 20, 30]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("GROUP BY operations", () => {
    const models = [
      new Product({
        productCode: generateGtin(),
        inventedName: "alpha",
        nameMedicinalProduct: "med1",
        counter: 10,
        strengths: [],
        markets: [],
      }),
      new Product({
        productCode: generateGtin(),
        inventedName: "alpha",
        nameMedicinalProduct: "med2",
        counter: 20,
        strengths: [],
        markets: [],
      }),
      new Product({
        productCode: generateGtin(),
        inventedName: "beta",
        nameMedicinalProduct: "med3",
        counter: 30,
        strengths: [],
        markets: [],
      }),
      new Product({
        productCode: generateGtin(),
        inventedName: "beta",
        nameMedicinalProduct: "med4",
        counter: 40,
        strengths: [],
        markets: [],
      }),
      new Product({
        productCode: generateGtin(),
        inventedName: "gamma",
        nameMedicinalProduct: "med5",
        counter: 50,
        strengths: [],
        markets: [],
      }),
    ];
    beforeAll(async () => {
      bulk = await repo.createAll(models);
    });

    it("groups by single field", async () => {
      const results = await repo
        .select()
        .groupBy("inventedName" as any)
        .execute();

      expect(results).toBeDefined();

      const keys = Object.keys(results).sort();
      expect(keys).toEqual(["alpha", "beta", "gamma"]);
      expect(results.alpha).toHaveLength(2);
      expect(results.beta).toHaveLength(2);
      expect(results.gamma).toHaveLength(1);
      expect(results.alpha.every((item) => item.inventedName === "alpha")).toBe(
        true
      );
      expect(results.gamma.every((item) => item.inventedName === "gamma")).toBe(
        true
      );
    });

    it("groups by multiple fields with thenBy()", async () => {
      const results = (await repo
        .select()
        .groupBy("inventedName" as any)
        .thenBy("nameMedicinalProduct" as any)
        .execute()) as Record<string, Record<string, Product[]>>;

      expect(results).toBeDefined();
      const combos = new Set<string>();
      for (const [inventedName, nested] of Object.entries(results)) {
        expect(Object.keys(nested).length).toBeGreaterThan(0);
        for (const [medicine, group] of Object.entries(nested)) {
          combos.add(`${inventedName}-${medicine}`);
          expect(
            group.every(
              (product) =>
                product.inventedName === inventedName &&
                product.nameMedicinalProduct === medicine
            )
          ).toBe(true);
        }
      }
      expect(combos.size).toBe(5);
    });

    it("throws if groupBy is called after orderBy", async () => {
      const builder = repo.select().orderBy(["counter", OrderDirection.ASC]);
      expect(() => (builder as any).groupBy("inventedName")).toThrow(
        QueryError
      );
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("Condition operators", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "product-" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index * 10,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("filters with eq() - equality", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).eq(50))
        .execute();

      expect(results.length).toBe(1);
      expect(results[0].counter).toBe(50);
    });

    it("filters with dif() - inequality", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).dif(50))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(9);
      expect(results.map((r) => r.counter)).not.toContain(50);
    });

    it("filters with gte() - greater than or equal", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).gte(70))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(3);
      expect(results.map((r) => r.counter)).toEqual([70, 80, 90]);
    });

    it("filters with lte() - less than or equal", async () => {
      const results = await repo
        .select()
        .where(Condition.attr<Product>("counter" as any).lte(20))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(3);
      expect(results.map((r) => r.counter)).toEqual([0, 10, 20]);
    });

    it("filters with regexp() - pattern matching", async () => {
      const results = await repo
        .select()
        .where(
          Condition.attr<Product>("inventedName" as any).regexp(
            "^product-[0-3]$"
          )
        )
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(4);
      expect(results.map((r) => r.inventedName)).toEqual([
        "product-0",
        "product-1",
        "product-2",
        "product-3",
      ]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("NOT condition", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "product-" + index,
          nameMedicinalProduct: "medicine" + index,
          counter: index * 10,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("negates a simple condition with not()", async () => {
      // Get all products where counter is NOT equal to 50
      const condition = Condition.attr<Product>("counter" as any).eq(50);
      const results = await repo
        .select()
        .where(condition.not(50))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(9);
      expect(results.map((r) => r.counter)).not.toContain(50);
    });

    it("negates a compound condition", async () => {
      // NOT (counter >= 50 AND counter <= 70)
      const rangeCondition = Condition.attr<Product>("counter" as any)
        .gte(50)
        .and(Condition.attr<Product>("counter" as any).lte(70));

      const results = await repo
        .select()
        .where(rangeCondition.not(null))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      // Should exclude 50, 60, 70 - leaving 0, 10, 20, 30, 40, 80, 90
      expect(results.length).toBe(7);
      expect(results.map((r) => r.counter)).toEqual([
        0, 10, 20, 30, 40, 80, 90,
      ]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("Compound conditions with AND/OR", () => {
    beforeAll(async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: index < 5 ? "groupA" : "groupB",
          nameMedicinalProduct: "medicine" + index,
          counter: index * 10,
          strengths: [],
          markets: [],
        });
      });
      bulk = await repo.createAll(models);
    });

    it("combines conditions with and()", async () => {
      const results = await repo
        .select()
        .where(
          Condition.attr<Product>("inventedName" as any)
            .eq("groupA")
            .and(Condition.attr<Product>("counter" as any).gte(20))
        )
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      // groupA has counter 0,10,20,30,40 - only 20,30,40 match gte(20)
      expect(results.length).toBe(3);
      expect(results.map((r) => r.counter)).toEqual([20, 30, 40]);
    });

    it("combines conditions with or()", async () => {
      const results = await repo
        .select()
        .where(
          Condition.attr<Product>("counter" as any)
            .eq(0)
            .or(Condition.attr<Product>("counter" as any).eq(90))
        )
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(2);
      expect(results.map((r) => r.counter)).toEqual([0, 90]);
    });

    it("combines conditions using static Condition.and()", async () => {
      const condition1 = Condition.attr<Product>("inventedName" as any).eq(
        "groupB"
      );
      const condition2 = Condition.attr<Product>("counter" as any).lt(80);

      const results = await repo
        .select()
        .where(Condition.and(condition1, condition2))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      // groupB has counter 50,60,70,80,90 - only 50,60,70 match lt(80)
      expect(results.length).toBe(3);
      expect(results.map((r) => r.counter)).toEqual([50, 60, 70]);
    });

    it("combines conditions using static Condition.or()", async () => {
      const condition1 = Condition.attr<Product>("counter" as any).eq(10);
      const condition2 = Condition.attr<Product>("counter" as any).eq(80);

      const results = await repo
        .select()
        .where(Condition.or(condition1, condition2))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      expect(results.length).toBe(2);
      expect(results.map((r) => r.counter)).toEqual([10, 80]);
    });

    it("handles complex nested conditions", async () => {
      // (groupA AND counter >= 30) OR (groupB AND counter <= 60)
      const groupACondition = Condition.attr<Product>("inventedName" as any)
        .eq("groupA")
        .and(Condition.attr<Product>("counter" as any).gte(30));

      const groupBCondition = Condition.attr<Product>("inventedName" as any)
        .eq("groupB")
        .and(Condition.attr<Product>("counter" as any).lte(60));

      const results = await repo
        .select()
        .where(groupACondition.or(groupBCondition))
        .orderBy(["counter", OrderDirection.ASC])
        .execute();

      // groupA: 30,40 | groupB: 50,60
      expect(results.length).toBe(4);
      expect(results.map((r) => r.counter)).toEqual([30, 40, 50, 60]);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });

  describe("PAGINATE operations", () => {
    beforeAll(async () => {
      const models = new Array(25).fill(0).map((_, index) => {
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

    it("creates a paginator with specified page size", async () => {
      const paginator = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .paginate(10);

      expect(paginator).toBeDefined();
      expect(paginator.size).toBe(10);
    });

    it("retrieves pages sequentially using next()", async () => {
      const paginator = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .paginate(10);

      const page1 = await paginator.page(1);
      expect(page1.length).toBe(10);
      expect(page1.map((r) => r.counter)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);

      const page2 = await paginator.next();
      expect(page2.length).toBe(10);
      expect(page2.map((r) => r.counter)).toEqual([
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      ]);

      const page3 = await paginator.next();
      expect(page3.length).toBe(5); // Only 5 remaining
      expect(page3.map((r) => r.counter)).toEqual([20, 21, 22, 23, 24]);
    });

    it("retrieves specific pages by number", async () => {
      const paginator = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .paginate(10);

      // Get page 2 directly
      const page2 = await paginator.page(2);
      expect(page2.length).toBe(10);
      expect(page2.map((r) => r.counter)).toEqual([
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      ]);

      // Go back to page 1
      const page1 = await paginator.page(1);
      expect(page1.length).toBe(10);
      expect(page1.map((r) => r.counter)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
    });

    it("provides pagination metadata", async () => {
      const paginator = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .paginate(10);

      await paginator.page(1);
      expect(paginator.current).toBe(1);
      expect(paginator.total).toBe(3); // 25 records / 10 per page = 3 pages
      expect(paginator.count).toBe(25);
    });

    afterAll(async () => {
      if (bulk) {
        await repo.deleteAll(bulk.map((b) => b[pk] as string));
      }
    });
  });
});
