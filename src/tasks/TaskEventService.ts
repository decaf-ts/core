import { Service } from "../services/services";
import { type Repo } from "../repository/Repository";
import { ModelService } from "../services/ModelService";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskModel } from "./models/TaskModel";
import { TaskService } from "./TaskService";

export class TaskEventService extends ModelService<TaskEventModel> {
  constructor() {
    super(TaskEventModel);
  }

  override get repo(): Repo<TaskEventModel> {
    if (!this._repository) {
      this._repository = (Service.get(TaskModel as any) as TaskService<any>)[
        "events"
      ];
    }
    return this._repository;
  }
}
