import {
  model,
  Model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { Repository, table } from "../../src/index";

describe("TableName edge case", () => {
  it("handles modes with name property", () => {
    @table("tst_named")
    @model()
    class Named extends Model {
      @required()
      name!: string;

      constructor(arg?: ModelArg<Named>) {
        super(arg);
      }
    }

    expect(Model.tableName(Named)).toEqual("tst_named");
    expect(Model.tableName(new Named({ name: "tst_other" }))).toEqual(
      "tst_named"
    );
  });
});
