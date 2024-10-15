import {RamAdapter} from "./RamAdapter";
import {Adapter} from "../../src";
import {TestModel} from "./TestModel";
import {findPrimaryKey} from "@decaf-ts/db-decorators";
import {Model} from "@decaf-ts/decorator-validation";

Model.setBuilder(Model.fromModel)

describe("Adapter", () => {
  let adapter: Adapter<Record<string, any>, any>

  it("instantiates", () => {
    adapter = new RamAdapter();
    expect(adapter).toBeDefined();
    expect(Adapter["_cache"]["ram"]).toBeDefined();
  })

  it("defines current", () => {
    expect(Adapter.current).toBeUndefined();
    Adapter.setCurrent("ram");
    expect(Adapter.current).toBeDefined();
    expect(Adapter.current).toEqual(Adapter.get("ram"));
  })

  let model: TestModel;
  let prepared: Record<string, any>

  it("prepares models", async () => {
    model = new TestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789"
    })

    const {record, id} = await adapter.prepare(model, findPrimaryKey(model).id);
    expect(record).toMatchObject({
      tst_name: model.name,
      tst_nif: model.nif,
      createdOn: undefined,
      updatedOn: undefined
    })
    expect(id).toEqual(model.id);
    prepared = record;
  })

  it("reverts models", async () => {
    const reverted = await adapter.revert(prepared, TestModel, "id", model.id as string) as TestModel;
    expect(reverted).toBeDefined();
    expect(reverted).toBeInstanceOf(TestModel);
    expect(reverted.equals(model)).toEqual(true)
  })
})