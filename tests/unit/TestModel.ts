import {
  maxlength,
  minlength,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { pk } from "../../src";
import { column, table } from "../../src/model/decorators";
import { IdentifiedBaseModel } from "../../src/model/IdentifiedBaseModel";

@table("tst_user")
@model()
export class TestModel extends IdentifiedBaseModel {
  @pk()
  id!: string;

  @column("tst_name")
  @required()
  name!: string;

  @column("tst_nif")
  // @unique()
  @minlength(9)
  @maxlength(9)
  @required()
  nif!: string;

  constructor(arg?: ModelArg<TestModel>) {
    super(arg);
  }
}
