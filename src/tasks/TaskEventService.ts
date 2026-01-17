import { TaskEventModel } from "./models/TaskEventModel";
import { ModelService } from "../services/ModelService";
import { Constructor } from "@decaf-ts/decoration";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { ContextOf, EventIds } from "../persistence/types";
import { ContextualArgs } from "../utils/ContextualLoggedClass";
import { Context } from "../persistence/index";
import { TaskModel } from "./models/TaskModel";

export class TaskEventService extends ModelService<TaskEventModel> {
  constructor() {
    super(TaskEventModel);
    this.observe(
      { refresh: this.onCreate.bind(this) },
      this.repo.filters.onlyOnCreate
    );
  }

  protected onCreate(
    table: Constructor<TaskEventModel>,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    payload: TaskEventModel,
    ...args: ContextualArgs<ContextOf<this["repo"]>>
  ): Promise<void> {
    if (payload instanceof Context) {
      throw new InternalError(
        "Task handlers require the payload to be included"
      );
    }
    const { log, ctxArgs } = this.logCtx(args, this.onCreate);
    log.verbose(
      `handling task event: ${event} for task ${payload.taskId}: issuing ${payload.classification}`
    );
    return this.updateObservers(
      TaskModel,
      payload.classification,
      payload.taskId,
      payload,
      ...ctxArgs
    );
  }
}
