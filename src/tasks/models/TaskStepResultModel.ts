import {
  min,
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { TaskStatus } from "../constants";
import { TaskErrorModel } from "./TaskErrorModel";
import { description, prop } from "@decaf-ts/decoration";

@model()
export class TaskStepResultModel extends Model {
  @required()
  @description("The status of a step")
  status!: TaskStatus;

  @prop()
  @description("The result of a successful step")
  output?: any;

  @prop()
  @description("the error of a failed step")
  error?: TaskErrorModel;

  @prop()
  @min(1)
  @description("Number of attempts taken to complete or fail this step")
  attempt?: number;

  constructor(arg?: ModelArg<TaskStepResultModel>) {
    super(arg);
  }
}
