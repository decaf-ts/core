import { model, type ModelArg, required } from "@decaf-ts/decorator-validation";
import { TaskBaseModel } from "./TaskBaseModel";
import { description, prop } from "@decaf-ts/decoration";
import { serialize } from "@decaf-ts/db-decorators";

@model()
export class TaskStepSpecModel extends TaskBaseModel {
  @required()
  @prop()
  @description("task handler type")
  @serialize()
  classification!: string; // handler type

  @description("optional task step input")
  @prop()
  @serialize()
  input?: any;

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
