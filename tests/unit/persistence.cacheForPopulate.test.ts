import { Adapter } from "../../src";
import { cacheModelForPopulate } from "../../src/model/construction";
import { RamAdapter, RamFlavour } from "../../src/ram";
import { DefaultAdapterFlags } from "../../src/persistence/constants";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { TestModel } from "./TestModel";

describe("persistence cacheForPopulate isolation", () => {
  beforeAll(() => {
    Adapter.setCurrent(RamFlavour);
  });

  beforeEach(() => {
    for (const key of Object.keys(DefaultAdapterFlags.cacheForPopulate)) {
      delete DefaultAdapterFlags.cacheForPopulate[key];
    }
  });

  it("keeps DefaultAdapterFlags.cacheForPopulate empty when contexts cache relationships", async () => {
    const adapter = new RamAdapter();
    const context = await adapter.context(OperationKeys.CREATE, {}, TestModel);
    const model = new TestModel({
      id: "cache",
      name: "cached",
      nif: "123456789",
    });
    await cacheModelForPopulate(context, model, "name", "cache", {
      value: true,
    });
    expect(DefaultAdapterFlags.cacheForPopulate).toEqual({});
  });
});
