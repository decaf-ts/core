import { E2eConfig } from "./e2e.config";
import { Repository } from "../../src/repository/Repository";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { generateGtin } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import {
  Observer,
  OrderDirection,
  PersistenceKeys,
  RamRepository,
} from "../../src/index";

const { adapterFactory } = E2eConfig;

const ramAdapter = adapterFactory();

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository query test", () => {
  let created: Product;

  const repo = new Repository(ramAdapter, Clazz);
  let observer: Observer;
  let mock: any;

  let bulk: Product[];

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

  describe("Querying", () => {
    it("Creates to query", async () => {
      const models = new Array(10).fill(0).map((_, index) => {
        const i = 9 - index;
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "name" + i,
          nameMedicinalProduct: "medicine" + i,
          counter: i,
          strengths: [
            {
              productCode: id,
              strength: "200mg",
              substance: "Ibuprofen",
            },
            {
              productCode: id,
              strength: "400mg",
              substance: "Ibuprofen",
            },
          ],
          markets: [
            {
              productCode: id,
              marketId: "BR",
              nationalCode: "BR",
              mahName: "ProPharma BR",
            },
            {
              productCode: id,
              marketId: "US",
              nationalCode: "US",
              mahName: "ProPharma US",
            },
          ],
        });
      });
      bulk = await repo.createAll(models);
      expect(bulk).toBeDefined();
      expect(Array.isArray(bulk)).toEqual(true);
      expect(bulk.every((el) => el instanceof Product)).toEqual(true);
      expect(bulk.every((el) => !el.hasErrors())).toEqual(true);

      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.CREATE,
        bulk.map((b) => b[pk]),
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("performs simple selects", async () => {
      const selected = await repo.select().execute();
      expect(selected).toBeDefined();
      const selectedIds = selected.map((el) => el[pk]).sort();
      const bulkIds = bulk.map((el) => el[pk]).sort();
      expect(selectedIds).toEqual(bulkIds);
    });

    it("performs sorted selects on numbers", async () => {
      let selected = await repo
        .select()
        .orderBy(["counter", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["counter", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });

    it("performs sorted selects on strings", async () => {
      let selected = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["inventedName", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });

    it("performs sorted selects on dates", async () => {
      let selected = await repo
        .select()
        .orderBy(["createdAt", OrderDirection.DSC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk.reverse()));

      selected = await repo
        .select()
        .orderBy(["createdAt", OrderDirection.ASC])
        .execute();
      expect(selected).toBeDefined();
      expect(selected).toEqual(expect.arrayContaining(bulk));
    });
  });
});
