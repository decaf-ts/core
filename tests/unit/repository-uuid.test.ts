import { Dispatch } from "../../src/persistence/Dispatch";
console.log(Dispatch);
import { Adapter, column, Observer, pk, table } from "../../src";
import { RamFlavour } from "../../src/ram/index";
import { RamAdapter } from "../../src/ram/RamAdapter";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import {
  maxlength,
  minlength,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { Context, NotFoundError, OperationKeys } from "@decaf-ts/db-decorators";
import { IdentifiedBaseModel } from "./IdentifiedBaseModel";

@table("tst_user_uuid")
@model()
export class TestModelUUID extends IdentifiedBaseModel {
  @pk({ type: "uuid" })
  id!: string;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModelUUID>) {
    super(arg);
  }
}

@table("tst_user_serial")
@model()
export class TestModelSerial extends IdentifiedBaseModel {
  @pk({ type: "serial" })
  id!: string;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModelSerial>) {
    super(arg);
  }
}

describe("Repository UUID", () => {
  let created: TestModelUUID;

  const repo = new Repository(ramAdapter, TestModelUUID);
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
    const model = new TestModelUUID({
      name: "test_name",
      nif: "123456789",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
    expect(mock).toHaveBeenCalledWith(
      TestModelUUID,
      OperationKeys.CREATE,
      expect.any(String),
      expect.any(Object),
      expect.any(Context)
    );
  });

  it("reads", async () => {
    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
  });

  it("updates", async () => {
    const toUpdate = new TestModelUUID(
      Object.assign({}, created, {
        name: "new_test_name",
      })
    );

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedAt", "name", "updatedBy")).toEqual(
      true
    ); // minus the expected changes
    expect(mock).toHaveBeenCalledWith(
      TestModelUUID,
      OperationKeys.UPDATE,
      updated.id,
      expect.any(Object),
      expect.any(Context)
    );
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as string);

    expect(deleted).toBeDefined();
    expect(deleted.id).toEqual(created.id); // same model
    await expect(repo.read(created.id as string)).rejects.toThrowError(
      NotFoundError
    );
    expect(mock).toHaveBeenCalledWith(
      TestModelUUID,
      OperationKeys.DELETE,
      deleted.id,
      expect.any(Object),
      expect.any(Context)
    );
  });
});

describe("Repository Serial", () => {
  let created: TestModelSerial;

  const repo = new Repository(ramAdapter, TestModelSerial);
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
    const model = new TestModelSerial({
      name: "test_name",
      nif: "123456789",
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
    expect(mock).toHaveBeenCalledWith(
      TestModelSerial,
      OperationKeys.CREATE,
      "00000000000001",
      expect.any(Object),
      expect.any(Context)
    );
  });

  it("reads", async () => {
    const read = await repo.read(created.id);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
  });

  it("updates", async () => {
    const toUpdate = new TestModelSerial(
      Object.assign({}, created, {
        name: "new_test_name",
      })
    );

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedAt", "name", "updatedBy")).toEqual(
      true
    ); // minus the expected changes
    expect(mock).toHaveBeenCalledWith(
      TestModelSerial,
      OperationKeys.UPDATE,
      updated.id,
      expect.any(Object),
      expect.any(Context)
    );
  });

  it("deletes", async () => {
    const deleted = await repo.delete(created.id as string);

    expect(deleted).toBeDefined();
    expect(deleted.id).toEqual(created.id); // same model
    await expect(repo.read(created.id as string)).rejects.toThrowError(
      NotFoundError
    );
    expect(mock).toHaveBeenCalledWith(
      TestModelSerial,
      OperationKeys.DELETE,
      deleted.id,
      expect.any(Object),
      expect.any(Context)
    );
  });
});
