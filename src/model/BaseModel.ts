import { DBOperations, timestamp } from "@decaf-ts/db-decorators";
import { ModelArg, Model } from "@decaf-ts/decorator-validation";

export abstract class BaseModel extends Model {
  @timestamp(DBOperations.CREATE)
  createdOn!: Date;
  @timestamp()
  updatedOn!: Date;

  protected constructor(arg?: ModelArg<BaseModel>) {
    super(arg);
  }
}
