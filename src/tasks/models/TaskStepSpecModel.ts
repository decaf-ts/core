import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { description, prop } from "@decaf-ts/decoration";

@model()
export class TaskStepSpecModel extends Model {
  @required()
  @prop()
  @description("task handler type")
  classification!: string; // handler type

  @description("optional task step input")
  @prop()
  input?: any;

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
