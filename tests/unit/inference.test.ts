import { RamAdapter } from "../../src/ram/RamAdapter";

const ramAdapter = new RamAdapter();

import { Repository } from "../../src/repository/Repository";
import { Model } from "@decaf-ts/decorator-validation";
import { TestModel } from "./TestModel";

Model.setBuilder(Model.fromModel);

describe("Query type inference", () => {
  let created: TestModel[];

  const repo = new Repository(ramAdapter, TestModel);

  beforeAll(async () => {
    const models = [1, 2, 3, 4, 5].map(
      (i) =>
        new TestModel({
          id: "id" + i,
          name: "test_name" + i,
          nif: "12345678" + i,
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestModel)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("infers properly", async () => {
    const keys = ["id"] as const;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const partialResult = await repo.select(keys).execute();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const completeResult = await repo.select().execute();
  });
});
