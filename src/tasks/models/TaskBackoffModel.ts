import {
  Model,
  model,
  type ModelArg,
  option,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { BackoffStrategy, JitterStrategy } from "../constants";
import { description } from "@decaf-ts/decoration";

@model()
export class TaskBackoffModel extends Model {
  @required()
  @type(String)
  @option(BackoffStrategy)
  @description("the backoff strategy")
  strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL;

  @required()
  @description("base interval between attempts")
  baseMs: number = 1000;

  @required()
  @description("max interval")
  maxMs: number = 60_000;

  @type(String)
  @option(JitterStrategy)
  @description("optional jitter strategy")
  jitter?: JitterStrategy = JitterStrategy.FULL;

  constructor(arg?: ModelArg<TaskBackoffModel>) {
    super(arg);
  }
}
