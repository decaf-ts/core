import { Repository } from "../../src";
import { TestModel } from "./TestModel";

describe("repository inference", () => {
  it.skip("properly infers the repo type", () => {
    const repo = Repository.forModel(TestModel);
    repo.select(["nif"]).execute();
  });
});
