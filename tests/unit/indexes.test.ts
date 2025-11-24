import { Model, model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { index, pk, Repository } from "../../src";
import { uses } from "@decaf-ts/decoration";

describe("Indexes", () => {
  @uses("ram")
  @model()
  class IndexedModel extends Model {
    @pk()
    id!: string;

    @index("name_index")
    @required()
    name!: string;

    @required()
    description!: string;
    constructor(arg?: ModelArg<IndexedModel>) {
      super(arg);
    }
  }

  it("extracts indexes", () => {
    const indexes = Model.indexes(IndexedModel);
    expect(indexes).toBeDefined();
    expect(indexes).toEqual({
      id: {
        index: {
          name: undefined,
          compositions: undefined,
          directions: ["asc", "desc"],
        },
      },
      name: {
        index: {
          name: "name_index",
          compositions: undefined,
          directions: undefined,
        },
      },
    });
  });
});
