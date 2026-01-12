import {
  option,
  type,
  model,
  required,
  type ModelArg,
} from "@decaf-ts/decorator-validation";
import { BackoffStrategy, JitterStrategy } from "../constants";
import { description } from "@decaf-ts/decoration";
import { TaskBaseModel } from "./TaskBaseModel";

@model()
export class TaskBackoffModel extends TaskBaseModel {
  @required()
  @type(String)
  @option(BackoffStrategy)
  @description("the backoff strategy")
  strategy!: BackoffStrategy;

  @required()
  @description("timestamp of creation")
  baseMs!: number;

  @required()
  @description("timestamp of creation")
  maxMs!: number;

  @type(String)
  @option(JitterStrategy)
  @description("optional jitter strategy")
  jitter?: JitterStrategy;

  constructor(arg?: ModelArg<TaskBackoffModel>) {
    super(arg);
  }
}
