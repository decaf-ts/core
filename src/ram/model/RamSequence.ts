import { model, required } from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { BaseModel, index, table } from "../../model";
import { pk } from "../../identity";

@table("__RamSequence")
@model()
export class Sequence extends BaseModel {
  /**
   * @summary the Primary key for the DBSequence
   * @prop name
   *
   * @see pk
   */
  @pk()
  id!: string;
  /**
   * @summary the current value for the DBSequence
   * @prop current
   *
   * @see required
   * @see index
   */
  @required()
  @index()
  current!: string | number;

  constructor(seq?: ModelArg<Sequence>) {
    super(seq);
  }
}
