import {
  Model,
  ModelArg,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import { column, table } from "../../../../src/model/decorators";
import { pk } from "../../../../src";
import { index } from "../../../../src/model/indexing";

@table("fs_indexed_model")
@model()
export class IndexedFsModel extends Model {
  @pk()
  id!: string;

  @column("fs_name")
  @required()
  @index()
  name!: string;

  @column("fs_category")
  @required()
  @index(["name"], "category_name_index")
  category!: string;

  constructor(arg?: ModelArg<IndexedFsModel>) {
    super(arg);
  }
}
