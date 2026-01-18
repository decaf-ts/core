import { pk } from "../../identity/decorators";
import {
  date,
  model,
  type ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { table } from "../../model/decorators";
import { prop } from "@decaf-ts/decoration";
import {
  composed,
  readonly,
  serialize,
  transient,
} from "@decaf-ts/db-decorators";
import { TaskEventType } from "../constants";
import { uuid } from "../../persistence/decorators";
import { BaseModel } from "../../model/BaseModel";

@table("task_event")
@model()
export class TaskEventModel extends BaseModel {
  @composed(["taskId", "classification", "uuid"], ":")
  @pk()
  id!: string;

  @readonly()
  @required()
  @transient()
  @uuid(false)
  uuid!: string;

  @readonly()
  @required()
  taskId!: string;

  @date()
  @required()
  ts: Date = new Date();

  @readonly()
  @required()
  @option(TaskEventType)
  classification!: TaskEventType;

  @prop()
  @readonly()
  @serialize()
  payload?: any;

  constructor(arg?: ModelArg<TaskEventModel>) {
    super(arg);
  }
}
