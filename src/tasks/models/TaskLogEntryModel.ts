import { LogLevel } from "@decaf-ts/logging";
import {
  option,
  required,
  model,
  type ModelArg,
  Model,
  date,
} from "@decaf-ts/decorator-validation";
import { prop } from "@decaf-ts/decoration";

@model()
export class TaskLogEntryModel extends Model {
  @date()
  @required()
  ts: Date = new Date();

  @required()
  @prop()
  @option(LogLevel)
  level!: LogLevel;

  @required()
  @prop()
  msg!: string;

  @prop()
  meta?: any;

  constructor(arg?: ModelArg<TaskLogEntryModel>) {
    super(arg);
  }
}
