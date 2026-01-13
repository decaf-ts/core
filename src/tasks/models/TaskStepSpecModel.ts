import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { TaskBaseModel } from "./TaskBaseModel";
import { description } from "@decaf-ts/decoration";
import { serialize } from "@decaf-ts/db-decorators";

@model()
export class TaskStepSpecModel extends TaskBaseModel {
  @required()
  @description("task handler type")
  classification!: string; // handler type

  @description("optional task step input")
  @serialize()
  input?: any;

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
