import { DBModel } from "./DBModel";
import { ModelArg } from "@decaf-ts/decorator-validation";
import { timestamp } from "../validation/decorators";
import { DBOperations } from "../operations/constants";

export abstract class BaseModel extends DBModel {
  @timestamp(DBOperations.CREATE)
  createdOn?: Date = undefined;
  @timestamp()
  updatedOn?: Date = undefined;

  protected constructor(arg?: ModelArg<BaseModel>) {
    super(arg);
  }
}
