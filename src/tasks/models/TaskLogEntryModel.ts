import { LogLevel } from "@decaf-ts/logging";
import {
  option,
  required,
  model,
  type ModelArg,
  Model,
} from "@decaf-ts/decorator-validation";
import { prop } from "@decaf-ts/decoration";
import { createdAt } from "../../model/index";

@model()
export class TaskLogEntryModel extends Model {
  @createdAt()
  ts!: Date;

  @required()
  @option(LogLevel)
  level!: LogLevel;

  @required()
  msg!: string;

  @prop()
  meta?: any;

  constructor(arg?: ModelArg<TaskLogEntryModel>) {
    super(arg);
  }
}
