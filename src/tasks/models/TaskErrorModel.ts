import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { description, prop } from "@decaf-ts/decoration";

@model()
export class TaskErrorModel extends Model {
  @required()
  @description("The error message")
  message!: string;
  @prop()
  @description("The error stack")
  stack?: string;
  @prop()
  @description("The error code")
  code?: string;
  @prop()
  @description("The error details")
  details?: any;

  constructor(arg?: ModelArg<TaskErrorModel>) {
    super(arg);
  }
}
