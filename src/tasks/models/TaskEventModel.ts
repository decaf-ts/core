import { pk } from "../../identity/decorators";
import {
  date,
  Model,
  model,
  type ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { column, table } from "../../model/decorators";
import { prop } from "@decaf-ts/decoration";
import {
  composed,
  readonly,
  serialize,
  transient,
} from "@decaf-ts/db-decorators";
import { TaskEventType } from "../constants";
import { uuid } from "../../persistence/decorators";
import { index } from "../../model/index";
import { OrderDirection } from "../../repository/index";

@table("task_event")
@model()
export class TaskEventModel extends Model {
  @pk()
  @composed(["taskId", "classification", "uuid"], ":")
  id!: string;

  @column()
  @readonly()
  @required()
  @transient()
  @uuid(false)
  uuid!: string;

  @column()
  @readonly()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  taskId!: string;

  @date()
  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  ts: Date = new Date();

  @column()
  @readonly()
  @required()
  @option(TaskEventType)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  classification!: TaskEventType;

  @prop()
  @column()
  @serialize()
  @readonly()
  payload?: any;

  constructor(arg?: ModelArg<TaskEventModel>) {
    super(arg);
    if (typeof this.payload === "string") {
      try {
        this.payload = JSON.parse(this.payload);
      } catch {
        // keep original string if parsing fails
      }
    }
  }
}
