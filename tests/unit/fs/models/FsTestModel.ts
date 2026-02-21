import {
  Model,
  ModelArg,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import { pk } from "../../../../src";
import { column, table } from "../../../../src/model/decorators";

@table("fs_user")
@model()
export class FsTestModel extends Model {
  @pk()
  id!: string;

  @column("fs_name")
  @required()
  name!: string;

  @column("fs_nif")
  @required()
  nif!: string;

  constructor(arg?: ModelArg<FsTestModel>) {
    super(arg);
  }
}
