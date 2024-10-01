import { DBModel, DBOperations, timestamp } from "@decaf-ts/db-decorators";
import { ModelArg } from "@decaf-ts/decorator-validation";

export abstract class BaseModel extends DBModel {
  @timestamp(DBOperations.CREATE)
  createdOn?: Date = undefined;
  @timestamp()
  updatedOn?: Date = undefined;

  protected constructor(arg?: ModelArg<BaseModel>) {
    super(arg);
  }
}
