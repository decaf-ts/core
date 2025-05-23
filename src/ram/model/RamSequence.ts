import { model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { BaseModel, index, table } from "../../model";
import { pk } from "../../identity";

@table("__RamSequence")
@model()
export class Sequence extends BaseModel {
  @pk()
  id!: string;

  @required()
  @index()
  current!: string | number;

  constructor(seq?: ModelArg<Sequence>) {
    super(seq);
  }
}
