import { TaskEventModel } from "./models/TaskEventModel";

import { Context } from "../persistence/Context";
import { ObserverHandler } from "../persistence/ObserverHandler";
import { ObserverFilter } from "../persistence/types";
import { TaskContext } from "./TaskContext";
import { Observer } from "../interfaces/Observer";

export class TaskEventBus extends ObserverHandler<TaskContext> {
  protected readonly listeners = new Set<(evt: TaskEventModel) => void>();

  override observe(observer: Observer, filter?: ObserverFilter): () => void {
    return super.observe(observer, filter);
  }

  override unObserve(observer: Observer) {
    super.unObserve(observer);
  }

  emit(evt: TaskEventModel, ctx: Context) {
    this.updateObservers(TaskEventModel, evt.classification, evt.id, evt, ctx);
  }
}
