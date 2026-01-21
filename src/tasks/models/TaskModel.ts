import {
  date,
  min,
  Model,
  model,
  type ModelArg,
  option,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { pk } from "../../identity/decorators";
import { TaskStatus, TaskType } from "../constants";
import { TaskErrorModel } from "./TaskErrorModel";
import { TaskBackoffModel } from "./TaskBackoffModel";
import { TaskStepSpecModel } from "./TaskStepSpecModel";
import { TaskStepResultModel } from "./TaskStepResultModel";
import { description, prop } from "@decaf-ts/decoration";
import { serialize } from "@decaf-ts/db-decorators";
import {
  column,
  createdBy,
  table,
  createdAt,
  updatedAt,
  updatedBy,
} from "../../model/decorators";
import { TaskLogEntryModel } from "./TaskLogEntryModel";

@description("Holds the current step when applicable")
@table("tasks")
@model()
export class TaskModel<INPUT = any, OUTPUT = any> extends Model {
  @pk({ type: "uuid" })
  @description("the task id")
  id!: string;

  // required routing / identity
  @required()
  @type(String)
  @option(TaskType)
  @description("defines a single or composite task")
  atomicity: TaskType = TaskType.ATOMIC; // atomic handler type OR "composite"

  @required()
  @description("Holds task classification - must match @task()")
  classification!: string;

  // execution
  @required()
  @type(String)
  @option(TaskStatus)
  @description("Holds the task current status")
  status: TaskStatus = TaskStatus.PENDING;

  @prop()
  @serialize()
  @description("Holds task input")
  input?: INPUT;

  @prop()
  @serialize()
  @description("Holds the task output when successfully completed")
  output?: OUTPUT;

  @prop()
  @serialize()
  @description("Holds the error for failed tasks")
  error?: TaskErrorModel;

  // retries
  @required()
  @min(0)
  @description("Holds the current attempt")
  attempt!: number; // starts at 0

  @min(1)
  @required()
  @description("max attempts for the task")
  maxAttempts!: number;

  @required()
  @serialize()
  @description("backoff configuration")
  backoff!: TaskBackoffModel;

  @date()
  @description("Next execution timestamp")
  nextRunAt?: Date;

  // worker lease / claim
  @prop()
  @description("Task lease owner identifier")
  leaseOwner?: string;

  @date()
  @description("Task lease expiration timestamp")
  leaseExpiry?: Date;

  // composite
  @prop()
  @serialize()
  @description(
    "Holds the various steps definition and inputs - only for type === 'composite'"
  )
  steps?: TaskStepSpecModel[]; // only for type === "composite"

  @min(0)
  @prop()
  @description("Holds the current step - only for type === 'composite'")
  currentStep?: number; // index of next step to run

  @prop()
  @serialize()
  @description("Holds the step results - only for type === 'composite'")
  stepResults?: TaskStepResultModel[];

  @prop()
  @serialize()
  @description("Holds the task log entries")
  logTail?: TaskLogEntryModel[] = [];

  /**
   * @description Creation timestamp for the model
   * @summary Automatically set to the current date and time when the model is created
   */
  @column()
  @createdAt()
  @description("timestamp of creation")
  createdAt!: Date;

  /**
   * @description Last update timestamp for the model
   * @summary Automatically updated to the current date and time whenever the model is modified
   */
  @column()
  @updatedAt()
  @description("timestamp of last update")
  updatedAt!: Date;

  @column()
  @createdBy()
  @description("Holds the creator of the task")
  createdBy!: string;

  @column()
  @updatedBy()
  @description("Holds the creator of the task")
  updatedBy!: string;

  constructor(arg?: ModelArg<TaskModel>) {
    super(arg);
  }
}
