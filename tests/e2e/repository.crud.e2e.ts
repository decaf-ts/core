/* eslint-disable @typescript-eslint/no-unused-vars */

import { E2eConfig } from "./e2e.config";
import { Repo, Repository } from "../../src/repository/Repository";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";
import { generateGtin } from "./models/gtin";
import { Model } from "@decaf-ts/decorator-validation";
import {
  AllOperationKeys,
  ContextualArgs,
  EventIds,
  Observer,
  PersistenceKeys,
} from "../../src/index";
import { Constructor } from "@decaf-ts/decoration";
import { Logging, LogLevel, style } from "@decaf-ts/logging";
import { ProductStrength } from "./models/ProductStrength";
import { Market } from "./models/Market";
import { RamRepository } from "../../src/ram/index";
import { ProductImage } from "./models/ProductImage";

Logging.setConfig({ level: LogLevel.debug });

const { adapterFactory, logger, flavour } = E2eConfig;

const Clazz = Product;

const pk = Model.pk(Clazz);

describe("e2e Repository test", () => {
  let created: Product;

  let adapter: Awaited<ReturnType<typeof adapterFactory>>;
  let repo: Repo<Product>;
  let observer: Observer;
  let mock: jest.Func;

  let contextFactoryMock: jest.SpyInstance;
  let adapterContextFactory: any;
  let bulk: Product[];

  function MockCtxFactory(
    op: string,
    overrides: Partial<any>,
    model: Constructor,
    ...args: any[]
  ) {
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

    adapterContextFactory = adapter.context.bind(adapter);
    contextFactoryMock = jest
      .spyOn(adapter, "context")
      .mockImplementation(MockCtxFactory)
      .mockImplementationOnce(
        (
          op: string,
          overrides: Partial<any>,
          model: Constructor,
          ...args: any[]
        ) => {
          const ctx = MockCtxFactory(
            op,
            Object.assign({}, overrides, {
              PERSISTENT_PROPERTY: true,
            }),
            model,
            ...args
          );
          return ctx;
        }
      );
  });

  afterEach(() => {
    repo.unObserve(observer);
  });

  describe("Basic Crud", () => {
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

      created = await repo.create(model);

      expect(created).toBeDefined();

      expect(created.markets.length).toBe(2);
      expect(created.strengths.length).toBe(2);

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

    let updated: Product;

    it("updates", async () => {
      const toUpdate = new Product(
        Object.assign({}, created, {
          inventedName: "new_test_name",
          imageData: {
            productCode: created.productCode,
            content: "contetn",
          },
        })
      );

      updated = await repo.update(toUpdate);

      expect(updated).toBeDefined();
      expect(updated.equals(created)).toEqual(false);
      expect(updated.imageData).toBeDefined();

      const imageRepo = Repository.forModel(ProductImage);
      const img = await imageRepo.read(updated.imageData as unknown as string);
      expect(img).toBeDefined();
      expect(img.content).toEqual("contetn");
      expect(
        updated.equals(
          created,
          "updatedAt",
          "inventedName",
          "updatedBy",
          "version",
          "imageData"
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

    it("properly handles deletion of children on cascade - productImage", async () => {
      const toUpdate = new Product(
        Object.assign({}, updated, {
          inventedName: "yet_test_name",
          imageData: undefined,
        })
      );

      const strengthMock = jest.fn();
      const strengthObserver = new (class implements Observer {
        async refresh(...args: any[]): Promise<void> {
          const operation = args[1];
          strengthMock(...args);
        }
      })();

      const imageRepo = Repository.forModel(ProductImage);
      repo["adapter"].observe(
        strengthObserver,
        (
          table: Constructor | string,
          event: AllOperationKeys,
          id: EventIds,
          ...args: ContextualArgs<any>
        ) => {
          return table === ProductStrength;
        }
      );

      const afterCascade = await repo
        .override({ mergeForUpdate: false })
        .update(toUpdate);

      await expect(
        imageRepo.read(updated.imageData as unknown as string)
      ).rejects.toThrow(NotFoundError);

      repo["adapter"].unObserve(strengthObserver);

      updated = afterCascade;
    });

    it("properly handles deletion of children on cascade - strengths", async () => {
      const toUpdate = new Product(
        Object.assign({}, updated, {
          inventedName: "yet_test_name",
          strengths: [
            {
              productCode: created.productCode,
              strength: "400mg",
              substance: "other",
            },
            {
              productCode: created.productCode,
              strength: "1000mg",
              substance: "aspirin",
            },
          ],
        })
      );

      const strengthMock = jest.fn();
      const strengthObserver = new (class implements Observer {
        async refresh(...args: any[]): Promise<void> {
          const operation = args[1];
          strengthMock(...args);
        }
      })();

      const strengthRepo = Repository.forModel(ProductStrength);
      repo["adapter"].observe(
        strengthObserver,
        (
          table: Constructor | string,
          event: AllOperationKeys,
          id: EventIds,
          ...args: ContextualArgs<any>
        ) => {
          return table === ProductStrength;
        }
      );

      const afterCascade = await repo.update(toUpdate);

      expect(afterCascade).toBeDefined();
      expect(afterCascade.equals(updated)).toEqual(false);
      expect(
        afterCascade.equals(
          updated,
          "updatedAt",
          "inventedName",
          "strengths",
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

      expect(strengthMock).toHaveBeenCalledWith(
        ProductStrength,
        OperationKeys.DELETE,
        [1, 2],
        expect.any(Array),
        expect.any(Context)
      );
      repo["adapter"].unObserve(strengthObserver);

      updated = afterCascade;
    });

    it("properly handles deletion of children on cascade - market", async () => {
      const toUpdate = new Product(
        Object.assign({}, updated, {
          inventedName: "yet_yet_test_name",
          markets: [
            {
              productCode: updated.productCode,
              marketId: "PT",
              nationalCode: "PT",
              mahName: "ProPharma PT",
            },
            {
              productCode: updated.productCode,
              marketId: "AS",
              nationalCode: "AS",
              mahName: "ProPharma AS",
            },
          ],
        })
      );

      const marketMock = jest.fn();
      const marketObserver = new (class implements Observer {
        async refresh(...args: any[]): Promise<void> {
          const operation = args[1];
          marketMock(...args);
        }
      })();

      const marketRepo = Repository.forModel(Market);
      repo["adapter"].observe(
        marketObserver,
        (
          table: Constructor | string,
          event: AllOperationKeys,
          id: EventIds,
          ...args: ContextualArgs<any>
        ) => {
          return table === Market;
        }
      );

      const afterCascade = await repo.update(toUpdate);

      expect(afterCascade).toBeDefined();
      expect(afterCascade.equals(updated)).toEqual(false);
      expect(
        afterCascade.equals(
          updated,
          "updatedAt",
          "inventedName",
          "markets",
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

      expect(marketMock).toHaveBeenCalledWith(
        Market,
        OperationKeys.DELETE,
        [`${toUpdate.productCode}:BR`, `${toUpdate.productCode}:US`],
        expect.any(Array),
        expect.any(Context)
      );
      repo["adapter"].unObserve(marketObserver);
      updated = afterCascade;
    });

    it("properly handles deletion of children on cascade - empty list", async () => {
      const toUpdate = new Product(
        Object.assign({}, updated, {
          inventedName: "yet_yet_test_name",
          markets: [],
        })
      );

      const marketMock = jest.fn();
      const marketObserver = new (class implements Observer {
        async refresh(...args: any[]): Promise<void> {
          const operation = args[1];
          marketMock(...args);
        }
      })();

      const marketRepo = Repository.forModel(Market);
      repo["adapter"].observe(
        marketObserver,
        (
          table: Constructor | string,
          event: AllOperationKeys,
          id: EventIds,
          ...args: ContextualArgs<any>
        ) => {
          return table === Market;
        }
      );

      const afterCascade = await repo.update(toUpdate);

      await expect(
        marketRepo.read(updated.markets[0] as unknown as string)
      ).rejects.toThrow(NotFoundError);
      expect(afterCascade).toBeDefined();
      expect(afterCascade.equals(updated)).toEqual(false);
      expect(
        afterCascade.equals(
          updated,
          "updatedAt",
          "inventedName",
          "markets",
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

      expect(marketMock).toHaveBeenCalledWith(
        Market,
        OperationKeys.DELETE,
        [`${toUpdate.productCode}:PT`, `${toUpdate.productCode}:AS`],
        expect.any(Array),
        expect.any(Context)
      );
      repo["adapter"].unObserve(marketObserver);
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.productCode as string);

      expect(deleted).toBeDefined();
      expect(deleted.productCode).toEqual(created.productCode); // same model
      await expect(repo.read(created.productCode as string)).rejects.toThrow(
        NotFoundError
      );
      expect(mock).toHaveBeenCalledWith(
        Product,
        OperationKeys.DELETE,
        deleted.productCode,
        expect.any(Object),
        expect.any(Context)
      );
      const strengthRepo = Repository.forModel(ProductStrength);
      await expect(strengthRepo.read(deleted.strengths[0].id)).rejects.toThrow(
        NotFoundError
      );
      await expect(strengthRepo.read(deleted.strengths[1].id)).rejects.toThrow(
        NotFoundError
      );

      const marketRepo = Repository.forModel(Market);
      await expect(marketRepo.read(deleted.markets[0] as any)).rejects.toThrow(
        NotFoundError
      );
      await expect(marketRepo.read(deleted.markets[1] as any)).rejects.toThrow(
        NotFoundError
      );

      const imageRepo = Repository.forModel(ProductImage);
      await expect(
        imageRepo.read(deleted.imageData as unknown as string)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("Cascade delete hardening", () => {
    it("removes one-to-one child when deleting a product", async () => {
      const id = generateGtin();
      const model = new Product({
        productCode: id,
        inventedName: "cascade-delete-single",
        nameMedicinalProduct: "cascade-mp",
        imageData: {
          productCode: id,
          content: "cascade-single",
        },
        strengths: [
          {
            productCode: id,
            strength: "50mg",
            substance: "test",
          },
        ],
        markets: [
          {
            productCode: id,
            marketId: "CX",
            nationalCode: "CX",
            mahName: "Cascade CX",
          },
        ],
      });

      await repo.create(model);
      const imageRepo = Repository.forModel(ProductImage);
      await expect(imageRepo.read(id)).resolves.toBeDefined();

      await repo.delete(id);
      await expect(imageRepo.read(id)).rejects.toThrow(NotFoundError);
    });

    it("removes one-to-one children when using deleteAll", async () => {
      const ids = [generateGtin(), generateGtin()];
      const models = ids.map((productCode, index) => {
        return new Product({
          productCode,
          inventedName: `cascade-delete-bulk-${index}`,
          nameMedicinalProduct: "cascade-mp",
          imageData: {
            productCode,
            content: `bulk-${index}`,
          },
          strengths: [
            {
              productCode,
              strength: "75mg",
              substance: `bulk-${index}`,
            },
          ],
          markets: [
            {
              productCode,
              marketId: "CX",
              nationalCode: "CX",
              mahName: `Cascade CX ${index}`,
            },
          ],
        });
      });

      await repo.createAll(models);
      await repo.deleteAll(ids as any[]);

      const imageRepo = Repository.forModel(ProductImage);
      for (const id of ids) {
        await expect(imageRepo.read(id)).rejects.toThrow(NotFoundError);
      }
    });

    it("removes one-to-many children when deleting a product", async () => {
      const id = generateGtin();
      const model = new Product({
        productCode: id,
        inventedName: "cascade-delete-strength-market",
        nameMedicinalProduct: "cascade-mp",
        strengths: [
          {
            productCode: id,
            strength: "150mg",
            substance: "test-a",
          },
          {
            productCode: id,
            strength: "250mg",
            substance: "test-b",
          },
        ],
        markets: [
          {
            productCode: id,
            marketId: "EU",
            nationalCode: "EU",
            mahName: "Cascade EU",
          },
          {
            productCode: id,
            marketId: "CA",
            nationalCode: "CA",
            mahName: "Cascade CA",
          },
        ],
      });

      const created = await repo.create(model);
      const strengthIds = created.strengths.map((strength) => strength.id);
      const marketIds = created.markets.map((market) => market as string);

      await repo.delete(id);

      const strengthRepo = Repository.forModel(ProductStrength);
      for (const strengthId of strengthIds) {
        await expect(strengthRepo.read(strengthId)).rejects.toThrow(NotFoundError);
      }

      const marketRepo = Repository.forModel(Market);
      for (const marketId of marketIds) {
        await expect(marketRepo.read(marketId as string)).rejects.toThrow(
          NotFoundError
        );
      }
    });

    it("removes one-to-many children when deleteAll is used", async () => {
      const ids = [generateGtin(), generateGtin()];
      const models = ids.map((productCode, index) => {
        return new Product({
          productCode,
          inventedName: `cascade-delete-range-${index}`,
          nameMedicinalProduct: "cascade-mp",
          strengths: [
            {
              productCode,
              strength: "125mg",
              substance: `bulk-${index}`,
            },
          ],
          markets: [
            {
              productCode,
              marketId: "US",
              nationalCode: "US",
              mahName: `Cascade US ${index}`,
            },
          ],
        });
      });

      const created = await repo.createAll(models);
      const deleted = await repo.deleteAll(
        created.map((product) => product.productCode as string)
      );

      const strengthRepo = Repository.forModel(ProductStrength);
      const marketRepo = Repository.forModel(Market);

      for (const product of deleted) {
        for (const strength of product.strengths) {
          await expect(strengthRepo.read(strength.id)).rejects.toThrow(
            NotFoundError
          );
        }
        for (const marketId of product.markets) {
          await expect(marketRepo.read(marketId as string)).rejects.toThrow(
            NotFoundError
          );
        }
      }
    });
  });

  describe("Bulk Crud", () => {
    it("Creates in bulk", async () => {
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
      console.log(
        "product_strength count after create",
        adapter["client"].get("product_strength")?.size
      );
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

    it("Reads in Bulk", async () => {
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

    it("Updates in Bulk", async () => {
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
      const ids = bulk.map((c) => c[pk]);
      const deleted = await repo.deleteAll(ids as any[]);
      expect(deleted).toBeDefined();
      expect(Array.isArray(deleted)).toEqual(true);
      expect(deleted.every((el) => el instanceof Product)).toEqual(true);
      expect(deleted.every((el) => !el.hasErrors())).toEqual(true);
      expect(deleted.every((el, i) => el.equals(updated[i]))).toEqual(true);

      const strengthRepo = Repository.forModel(ProductStrength);

      const marketRepo = Repository.forModel(Market);

      for (const p of deleted) {
        await expect(repo.read(p[Model.pk(Clazz) as any])).rejects.toThrow(
          NotFoundError
        );
        await expect(strengthRepo.read(p.strengths[0].id)).rejects.toThrow(
          NotFoundError
        );
        await expect(strengthRepo.read(p.strengths[1].id)).rejects.toThrow(
          NotFoundError
        );

        await expect(marketRepo.read(p.markets[0] as any)).rejects.toThrow(
          NotFoundError
        );
        await expect(marketRepo.read(p.markets[1] as any)).rejects.toThrow(
          NotFoundError
        );
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
