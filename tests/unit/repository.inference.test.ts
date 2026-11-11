import { it } from "@decaf-ts/for-testing";
import { Repository } from "../../src";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { TestModel } from "./TestModel";

describe("repository inference", () => {
  beforeAll(() => {
    new RamAdapter();
  });

  it("properly infers the repo type", async () => {
    const repo = Repository.forModel(TestModel);
    await repo.create(
      new TestModel({ id: "inference-1", name: "inferred", nif: "123456789" })
    );

    const selected = await repo.select(["nif"]).execute();
    // the selector narrows the result type to Pick<TestModel, "nif">
    const nifs: string[] = selected.map((entry) => entry.nif);
    expect(nifs).toContain("123456789");
    expect((selected[0] as unknown as TestModel).name).toBeUndefined();
  });

  it("returns properties mapped to custom column names from queries", async () => {
    const repo = Repository.forModel(TestModel);
    // name and nif are stored under @column("tst_name") / @column("tst_nif")
    const [found] = await repo
      .select()
      .where(repo.attr("id").eq("inference-1"))
      .execute();
    expect(found).toBeInstanceOf(TestModel);
    expect(found.name).toBe("inferred");
    expect(found.nif).toBe("123456789");
    expect(await repo.read("inference-1")).toMatchObject({
      name: found.name,
      nif: found.nif,
    });
  });
});
