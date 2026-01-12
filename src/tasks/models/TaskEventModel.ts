import { pk } from "../../identity/index";
import {
  Model,
  model,
  type ModelArg,
  option,
  required,
} from "@decaf-ts/decorator-validation";
import { createdAt, table } from "../../model/index";
import { prop } from "@decaf-ts/decoration";
import { composed, readonly, serialize } from "@decaf-ts/db-decorators";
import { TaskEventType } from "../constants";
import { uuid } from "../../persistence/decorators";

@table("task_event")
@model()
export class TaskEventModel extends Model {
  @composed(["taskId", "uuid", ":"])
  @pk({ type: String, generated: false })
  id!: string; // e.g. `${taskId}:${ts}:${rand}`

  @uuid(false)
  @readonly()
  @required()
  uuid!: string;

  @readonly()
  @required()
  taskId!: string;

  @createdAt()
  ts!: Date;

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
