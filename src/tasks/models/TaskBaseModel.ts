import { Model, type ModelArg } from "@decaf-ts/decorator-validation";
import { column, createdAt, updatedAt } from "../../model/decorators";
import { description } from "@decaf-ts/decoration";

export abstract class TaskBaseModel extends Model {
  /**
   * @description Creation timestamp for the model
   * @summary Automatically set to the current date and time when the model is created
   */
  @column()
  @createdAt()
  @description("timestamp of creation")
  createdAt!: Date;

  /**
   * @description Last update timestamp for the model
   * @summary Automatically updated to the current date and time whenever the model is modified
   */
  @column()
  @updatedAt()
  @description("timestamp of last update")
  updatedAt!: Date;

  protected constructor(arg?: ModelArg<TaskBaseModel>) {
    super(arg);
  }
}
