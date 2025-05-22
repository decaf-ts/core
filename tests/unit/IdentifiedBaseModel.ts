import { ModelArg } from "@decaf-ts/decorator-validation";
import { createdBy, updatedBy } from "../../src/model/decorators";
import { BaseModel } from "../../src/model/BaseModel";

export abstract class IdentifiedBaseModel extends BaseModel {
  @createdBy()
  createdBy!: string;
  @updatedBy()
  updatedBy!: string;

  protected constructor(arg?: ModelArg<IdentifiedBaseModel>) {
    super(arg);
  }
}
