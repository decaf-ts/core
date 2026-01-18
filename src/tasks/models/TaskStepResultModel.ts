import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { TaskStatus } from "../constants";
import { TaskErrorModel } from "./TaskErrorModel";
import { TaskBaseModel } from "./TaskBaseModel";
import { serialize } from "@decaf-ts/db-decorators";
import { description, prop } from "@decaf-ts/decoration";

@model()
export class TaskStepResultModel extends TaskBaseModel {
  @required()
  @prop()
  @description("The status of a step")
  @serialize()
  status!: TaskStatus;

  @prop()
  @description("The result of a successful step")
  output?: any;

  @prop()
  @description("the error of a failed step")
  error?: TaskErrorModel;

  constructor(arg?: ModelArg<TaskStepResultModel>) {
    super(arg);
  }
}
