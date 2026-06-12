import { Model, model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { index, pk } from "../../src";
import { OrderDirection } from "../../src/repository/constants";
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

  @uses("ram")
  @model()
  class CompositeIndexedModel extends Model {
    @pk()
    id!: string;

    @index([OrderDirection.ASC, OrderDirection.DSC])
    @index([OrderDirection.ASC, OrderDirection.DSC], ["id"])
    status!: string;

    @index([OrderDirection.ASC], ["status"])
    @index([OrderDirection.ASC], ["id"])
    createdAt!: string;

    constructor(arg?: ModelArg<CompositeIndexedModel>) {
      super(arg);
    }
  }

  it("extracts composite indexes alongside a plain index on the same property", () => {
    const indexes = Model.indexes(CompositeIndexedModel);
    expect(indexes.status).toEqual({
      index: {
        name: undefined,
        compositions: undefined,
        directions: ["asc", "desc"],
      },
      index_id: {
        name: undefined,
        compositions: ["id"],
        directions: ["asc", "desc"],
      },
    });
  });

  it("extracts multiple composite indexes declared on the same property", () => {
    const indexes = Model.indexes(CompositeIndexedModel);
    expect(indexes.createdAt).toEqual({
      index_status: {
        name: undefined,
        compositions: ["status"],
        directions: ["asc"],
      },
      index_id: {
        name: undefined,
        compositions: ["id"],
        directions: ["asc"],
      },
    });
  });
});
