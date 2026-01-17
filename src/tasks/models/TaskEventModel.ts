import { pk } from "../../identity/index";
import {
  date,
  Model,
  model,
  type ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { createdAt, table } from "../../model/index";
import { prop } from "@decaf-ts/decoration";
import {
  composed,
  readonly,
  serialize,
  transient,
} from "@decaf-ts/db-decorators";
import { TaskEventType } from "../constants";
import { uuid } from "../../persistence/decorators";

@table("task_event")
@model()
export class TaskEventModel extends Model {
  @pk()
  @composed(["taskId", "classification", "uuid"], ":")
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
