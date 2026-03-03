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
  createdAt,
  createdBy,
  table,
  updatedAt,
  updatedBy,
} from "../../model/decorators";
import { TaskLogEntryModel } from "./TaskLogEntryModel";
import { TaskIOSerializer } from "./TaskIOSerializer";
import { uuid } from "../../persistence/index";
import { index } from "../../model/index";
import { OrderDirection } from "../../repository/index";

@description("Holds the current step when applicable")
@table("tasks")
@model()
export class TaskModel<INPUT = any, OUTPUT = any> extends Model {
  @pk()
  @uuid()
  @description("the task id")
  id!: string;

  // required routing / identity
  @column()
  @required()
  @type(String)
  @option(TaskType)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("defines a single or composite task")
  atomicity: TaskType = TaskType.ATOMIC; // atomic handler type OR "composite"

  @column()
  @required()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds task classification - must match @task()")
  classification!: string;

  @column()
  @prop()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("optional task name for ambiguity")
  name?: string;

  // execution
  @column()
  @required()
  @type(String)
  @option(TaskStatus)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds the task current status")
  status: TaskStatus = TaskStatus.PENDING;

  @prop()
  @column()
  @serialize(TaskIOSerializer)
  @description("Holds task input")
  input?: INPUT;

  @prop()
  @column()
  @serialize(TaskIOSerializer)
  @description("Holds the task output when successfully completed")
  output?: OUTPUT;

  @prop()
  @column()
  @serialize()
  @description("Holds the error for failed tasks")
  error?: TaskErrorModel;

  // retries
  @column()
  @required()
  @min(0)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds the current attempt")
  attempt: number = 0;

  @column()
  @min(1)
  @required()
  @description("max attempts for the task")
  maxAttempts!: number;

  @column()
  @required()
  @serialize()
  @description("backoff configuration")
  backoff!: TaskBackoffModel;

  @date()
  @column()
  @description("Next execution timestamp")
  nextRunAt?: Date;

  @date()
  @column()
  @description("Task scheduled timestamp")
  scheduledTo?: Date;

  // worker lease / claim
  @prop()
  @column()
  @description("Task lease owner identifier")
  leaseOwner?: string;

  @date()
  @column()
  @description("Task lease expiration timestamp")
  leaseExpiry?: Date;

  // composite
  @prop()
  @column()
  @serialize()
  @description(
    "Holds the various steps definition and inputs - only for type === 'composite'"
  )
  steps?: TaskStepSpecModel[]; // only for type === "composite"

  @prop()
  @column()
  @min(0)
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds the current step - only for type === 'composite'")
  currentStep?: number; // index of next step to run

  @prop()
  @column()
  @serialize()
  @description("Holds the step results - only for type === 'composite'")
  stepResults?: TaskStepResultModel[];

  @prop()
  @column()
  @serialize()
  @description("Holds the task log entries")
  logTail?: TaskLogEntryModel[] = [];

  /**
   * @description Creation timestamp for the model
   * @summary Automatically set to the current date and time when the model is created
   */
  @column()
  @createdAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("timestamp of creation")
  createdAt!: Date;

  /**
   * @description Last update timestamp for the model
   * @summary Automatically updated to the current date and time whenever the model is modified
   */
  @column()
  @updatedAt()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("timestamp of last update")
  updatedAt!: Date;

  @column()
  @createdBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds the creator of the task")
  createdBy!: string;

  @column()
  @updatedBy()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  @description("Holds the creator of the task")
  updatedBy!: string;

  constructor(arg?: ModelArg<TaskModel>) {
    super(arg);
  }
}
