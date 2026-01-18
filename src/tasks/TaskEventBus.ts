import { TaskEventModel } from "./models/TaskEventModel";

import { Context } from "../persistence/Context";
import { ObserverHandler } from "../persistence/ObserverHandler";
import { EventIds, ObserverFilter } from "../persistence/types";
import { TaskContext } from "./TaskContext";
import { Observer } from "../interfaces/Observer";
import { Constructor } from "@decaf-ts/decoration";
import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { ContextualArgs } from "../utils/index";
import { Adapter } from "../persistence/index";
import { Model } from "@decaf-ts/decorator-validation";

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

  override async updateObservers<M extends Model>(
    model: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    evt: TaskEventModel,
    ...args: ContextualArgs<any>
  ): Promise<void> {
    const { log, ctxArgs } = Adapter.logCtx<Context>(
      this.updateObservers,
      undefined,
      false,
      ...args
    );
    const results = await Promise.allSettled(
      this.observers
        .filter((o) => {
          const { filter } = o;
          if (!filter) return true;
          try {
            return filter(model, event, id, ...ctxArgs);
          } catch (e: unknown) {
            log.error(
              `Failed to filter observer ${o.observer.toString()}: ${e}`
            );
            return false;
          }
        })
        .map((o) => {
          o.observer.refresh(evt, ...ctxArgs);
        })
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        log.error(
          `Failed to update observable ${this.observers[i].toString()}: ${result.reason}`
        );
    });
  }
}
