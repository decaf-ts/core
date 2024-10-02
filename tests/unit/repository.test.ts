import {TestModel} from "./TestModel";
import {RamAdapter} from "./RamAdapter";
import {Repository} from "../../src/repository/Repository";
import {Model} from "@decaf-ts/decorator-validation";

Model.setBuilder(Model.fromModel)

describe("Repository", () => {

  let created: TestModel;
  const adapter = new RamAdapter();
  const repo = new Repository(adapter, TestModel);

  it("creates", async () => {
    const model = new TestModel({
      id: Date.now().toString(),
      name: "test_name",
      nif: "123456789"
    });

    created = await repo.create(model);

    expect(created).toBeDefined();
  })

  it("reads", async () => {

    const read = await repo.read(created.id as string);

    expect(read).toBeDefined();
    expect(read.equals(created)).toEqual(true); // same model
    expect(read === created).toEqual(false); // different instances
  })

  it("updates", async () => {

    const toUpdate = new TestModel(Object.assign({}, created, {
      name: "new_test_name"
    }))

    const updated = await repo.update(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.equals(created)).toEqual(false);
    expect(updated.equals(created, "updatedOn", "name")).toEqual(true); // minus the expected changes
  })
})