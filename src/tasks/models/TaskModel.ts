import { TaskBaseModel } from "./TaskBaseModel";
import {
  date,
  min,
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
import { table } from "../../model/decorators";
import { TaskLogEntryModel } from "./TaskLogEntryModel";

@table("tasks")
@model()
export class TaskModel extends TaskBaseModel {
  @pk({ type: "uuid" })
  id!: string;

  // required routing / identity
  @required()
  @type(String)
  @option(TaskType)
  atomicity: TaskType = TaskType.ATOMIC; // atomic handler type OR "composite"

  @required()
  classification!: string;

  // execution
  @required()
  @type(String)
  @option(TaskStatus)
  status: TaskStatus = TaskStatus.PENDING;

  @prop()
  @serialize()
  input?: any;

  @prop()
  @serialize()
  output?: any;

  @prop()
  @serialize()
  error?: TaskErrorModel;

  // retries
  @min(0)
  @required()
  attempt!: number; // starts at 0

  @min(1)
  @required()
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
  steps?: TaskStepSpecModel[]; // only for type === "composite"

  @min(0)
  currentStep?: number; // index of next step to run

  @serialize()
  @prop()
  stepResults?: TaskStepResultModel[];

  // logging

  @serialize()
  @prop()
  logTail?: TaskLogEntryModel[] = [];

  constructor(arg?: ModelArg<TaskModel>) {
    super(arg);
  }
}
