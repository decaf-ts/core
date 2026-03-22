import { Service } from "../services/services";
import { type Repo } from "../repository/Repository";
import { ModelService } from "../services/ModelService";
import { TaskEventModel } from "./models/TaskEventModel";
import { TaskModel } from "./models/TaskModel";
import { TaskService } from "./TaskService";
import { SelectSelector, WhereOption } from "../query/index";

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

  override select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<TaskModel>[],
  >(): WhereOption<TaskModel, TaskModel[]>;
  override select<S extends readonly SelectSelector<TaskModel>[]>(
    selector: readonly [...S]
  ): WhereOption<TaskModel, Pick<TaskModel, S[number]>[]>;
  override select<S extends readonly SelectSelector<TaskModel>[]>(
    selector?: readonly [...S]
  ):
    | WhereOption<TaskModel, TaskModel[]>
    | WhereOption<TaskModel, Pick<TaskModel, S[number]>[]> {
    return this.repo.select(selector as readonly [...S]);
  }
}
