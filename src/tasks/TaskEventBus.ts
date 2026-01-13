import { TaskEventModel } from "./models/TaskEventModel";

import { ObserverFilter, ObserverHandler } from "../persistence/index";
import { TaskContext } from "./TaskContext";
import { Observer } from "../interfaces/index";

export class TaskEventBus extends ObserverHandler<TaskContext> {
  protected readonly listeners = new Set<(evt: TaskEventModel) => void>();

  override observe(observer: Observer, filter?: ObserverFilter) {
    super.observe(observer, filter);
  }

  override unObserve(observer: Observer) {
    super.unObserve(observer);
  }

  on(observer: Observer): () => void {
    this.observe(observer);
    return () => this.unObserve(observer);
  }

  emit(evt: TaskEventModel) {
    this.updateObservers(TaskEventModel, evt.classification, evt.id, evt);
  }
}
