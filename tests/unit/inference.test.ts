import { RamAdapter } from "../../src/ram/RamAdapter";
import { Adapter } from "../../src/index";
import { RamFlavour } from "../../src/ram/constants";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import { TestModel } from "./TestModel";

describe("Query type inference", () => {
  let created: TestModel[];

  const repo = new Repository(ramAdapter, TestModel);

  let models: any[];
  beforeAll(async () => {
    models = [1, 2, 3, 4, 5].map(
      (i) =>
        new TestModel({
          id: "id" + i,
          name: "test_name" + i,
          nif: "12345678" + i,
        })
    );
  });

  it("infers properly", async () => {
    const keys = ["id"] as const;
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestModel)).toEqual(true);
    expect(
      created.every((el) => {
        const errors = el.hasErrors();
        return !errors;
      })
    ).toEqual(true);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const partialResult = await repo.select(keys).execute();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const completeResult = await repo.select().execute();
  });
});
