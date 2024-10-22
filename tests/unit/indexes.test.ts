import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { index, pk, Repository, uses } from "../../src";

Model.setBuilder(Model.fromModel);

describe("Indexes", () => {
  @uses("ram")
  @model()
  class IndexedModel extends Model {
    @pk()
    id!: string;

    @index()
    @required()
    name!: string;

    @required()
    description!: string;
    constructor(arg?: ModelArg<IndexedModel>) {
      super(arg);
    }
  }

  it("extracts indexes", () => {
    const indexes = Repository.indexes(IndexedModel);
    expect(indexes).toBeDefined();
    expect(indexes).toEqual(
      expect.objectContaining({
        id: {
          index: {
            compositions: undefined,
            directions: undefined,
          },
        },
        name: {
          index: {
            compositions: undefined,
            directions: undefined,
          },
        },
      })
    );
  });
});
