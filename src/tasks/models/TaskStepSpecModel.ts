import {
  minlength,
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { description, prop } from "@decaf-ts/decoration";
import { list } from "@decaf-ts/decorator-validation";

@model()
export class TaskStepSpecModel extends Model {
  @required()
  @description("task handler type")
  classification!: string; // handler type

  @minlength(1)
  @description("optional task name for ambiguity")
  name?: string;

  @description("optional task step input")
  @prop()
  input?: any;

  @description(
    "Optional lock key. Tasks/steps sharing the same key cannot run concurrently"
  )
  @prop()
  lock?: string;

  @description(
    "Task-step dependencies. Supports '<taskId>' or '<taskId>:<step index|step reference>'"
  )
  @prop()
  @list(() => String)
  dependsOn?: string[];

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
