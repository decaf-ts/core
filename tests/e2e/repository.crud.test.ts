import { E2eConfig } from "./e2e.config";
const { adapterFactory } = E2eConfig;

const ramAdapter = adapterFactory();

import { Repository } from "../../src/repository/Repository";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { generateGtin } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import { Observer, PersistenceKeys, RamRepository } from "../../src/index";

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository test", () => {
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

  describe.skip("Basic Crud", () => {
    it("creates", async () => {
      const id = generateGtin();
      const model = new Product({
        productCode: id,
        inventedName: "test_name",
        nameMedicinalProduct: "123456789",
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
        // markets: [
        //   {
        //     productCode: id,
        //     marketId: "BR",
        //     nationalCode: "BR",
        //     mahName: "ProPharma BR",
        //   },
        //   {
        //     productCode: id,
        //     marketId: "US",
        //     nationalCode: "US",
        //     mahName: "ProPharma US",
        //   },
        // ],
      });

      created = await repo.create(model);

      expect(created).toBeDefined();
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.CREATE,
        id,
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("reads", async () => {
      const read = await repo.read(created.productCode);

      expect(read).toBeDefined();
      expect(read.equals(created)).toEqual(true); // same model
      expect(read === created).toEqual(false); // different instances
    });

    it("updates", async () => {
      const toUpdate = new Product(
        Object.assign({}, created, {
          inventedName: "new_test_name",
        })
      );

      const updated = await repo.update(toUpdate);

      expect(updated).toBeDefined();
      expect(updated.equals(created)).toEqual(false);
      expect(
        updated.equals(
          created,
          "updatedAt",
          "inventedName",
          "updatedBy",
          "version"
        )
      ).toEqual(true); // minus the expected changes
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.UPDATE,
        updated.productCode,
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.productCode as string);

      expect(deleted).toBeDefined();
      expect(deleted.productCode).toEqual(created.productCode); // same model
      await expect(
        repo.read(created.productCode as string)
      ).rejects.toThrowError(NotFoundError);
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.DELETE,
        deleted.productCode,
        expect.any(Object),
        expect.any(Context)
      );
    });
  });

  describe("Bulk Crud", () => {
    it("Creates in bulk", async () => {
      const repo: RamRepository<Product> = Repository.forModel<
        Product,
        RamRepository<Product>
      >(Product);
      const models = new Array(10).fill(0).map(() => {
        const id = generateGtin();
        return new Product({
          productCode: id,
          inventedName: "test_name",
          nameMedicinalProduct: "123456789",
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

    it.skip("Reads in Bulk", async () => {
      const repo: RamRepository<Product> = Repository.forModel<
        Product,
        RamRepository<Product>
      >(Product);
      const ids = bulk.map((c) => c[pk]) as number[];
      const read = await repo.readAll(ids);
      expect(read).toBeDefined();
      expect(Array.isArray(read)).toEqual(true);
      expect(read.every((el) => el instanceof Product)).toEqual(true);
      expect(read.every((el) => !el.hasErrors())).toEqual(true);
      expect(
        read.every((el, i) => {
          const equals = el.equals(bulk[i]);
          if (!equals)
            console.log(
              `element ${i} is different ${JSON.stringify(el.compare(bulk[i]))}`
            );
          return equals;
        })
      ).toEqual(true);
      expect(read.every((el) => !!(el as any)[PersistenceKeys.METADATA]));
    });

    let updated: Product[];

    it.skip("Updates in Bulk", async () => {
      const repo: RamRepository<Product> = Repository.forModel<
        Product,
        RamRepository<Product>
      >(Product);
      const toUpdate = bulk.map((c, i) => {
        return new Product({
          productCode: c.productCode,
          inventedName: "inventedName_" + i,
        });
      });
      updated = await repo.updateAll(toUpdate);
      expect(updated).toBeDefined();
      expect(Array.isArray(updated)).toEqual(true);
      expect(updated.every((el) => el instanceof Product)).toEqual(true);
      expect(updated.every((el) => !el.hasErrors())).toEqual(true);
      expect(updated.every((el, i) => el.equals(bulk[i]))).toEqual(false);
      expect(
        updated.every((el, i) =>
          el.equals(bulk[i], "inventedName", "updatedAt", "version")
        )
      ).toEqual(true);

      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.UPDATE,
        updated.map((u) => u[pk]),
        expect.any(Object),
        expect.any(Context)
      );
    });

    it("Deletes in Bulk", async () => {
      const repo: RamRepository<Product> = Repository.forModel<
        Product,
        RamRepository<Product>
      >(Product);
      const ids = bulk.slice(0, Math.floor(bulk.length / 2)).map((c) => c[pk]);
      const deleted = await repo.deleteAll(ids as any[]);
      expect(deleted).toBeDefined();
      expect(Array.isArray(deleted)).toEqual(true);
      expect(deleted.every((el) => el instanceof Product)).toEqual(true);
      expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
      expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);
      for (const k in deleted.map((c) => c[pk])) {
        await expect(repo.read(k)).rejects.toThrowError(NotFoundError);
      }
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.DELETE,
        ids,
        expect.any(Object),
        expect.any(Context)
      );
    });
  });
});
