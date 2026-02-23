import { Dispatch } from "../../src/persistence/Dispatch";
console.log(Dispatch);
import { Adapter, Observer } from "../../src";
import { RamFlavour } from "../../src/ram/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { Product } from "./models/Product";

describe("Repository", () => {
  let created: Product;

  const repo = new Repository(ramAdapter, Product);
  let observer: Observer;
  let mock: any;
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

  it("creates", async () => {
    const id = Date.now().toString();
    const model = new Product({
      productCode: id,
      inventedName: "Azitrex",
      nameMedicinalProduct: "Azithromycin",
      acfProductCheckURL: "https://example.com/check",
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
    await expect(repo.read(created.inventedName as string)).rejects.toThrow(
      NotFoundError
    );
    expect(mock).toHaveBeenCalledWith(
      Product,
      OperationKeys.DELETE,
      deleted.productCode,
      expect.any(Object),
      expect.any(Context)
    );
  });
});
