import { TaskEventModel } from "./models/TaskEventModel";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Observable } from "../interfaces/Observable";

export class TaskEventBus {
  protected readonly listeners = new Set<(evt: TaskEventModel) => void>();

  on(listener: (evt: TaskEventModel) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(evt: TaskEventModel) {
    for (const l of this.listeners) l(evt);
  }
}
