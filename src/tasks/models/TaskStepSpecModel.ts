import {
  min,
  minlength,
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";
import { description, prop } from "@decaf-ts/decoration";
import { list } from "@decaf-ts/decorator-validation";
import { serialize } from "@decaf-ts/db-decorators";
import { TaskBackoffModel } from "./TaskBackoffModel";

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

  @prop()
  @min(1)
  @description("Max attempts for this step. Defaults to 1 (no per-step retry).")
  maxAttempts?: number;

  @prop()
  @serialize()
  @description("Step-level backoff config. Falls back to the parent task backoff when absent.")
  backoff?: TaskBackoffModel;

  constructor(arg?: ModelArg<TaskStepSpecModel>) {
    super(arg);
  }
}
