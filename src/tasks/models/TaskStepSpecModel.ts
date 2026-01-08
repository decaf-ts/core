import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { TaskBaseModel } from "./TaskBaseModel";
import { description } from "@decaf-ts/decoration";

@model()
export class TaskStepSpecModel extends TaskBaseModel {
  @required()
  @description("task handler type")
  type!: string; // handler type

  @description("optional task step input")
  input?: any;

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
