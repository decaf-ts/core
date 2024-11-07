import { ModelArg } from "@decaf-ts/decorator-validation";
import { createdBy, updatedBy } from "./decorators";
import { BaseModel } from "./BaseModel";

export abstract class IdentifiedBaseModel extends BaseModel {
  @createdBy()
  createdBy!: string;
  @updatedBy()
  updatedBy!: string;

  protected constructor(arg?: ModelArg<IdentifiedBaseModel>) {
    super(arg);
  }
}
