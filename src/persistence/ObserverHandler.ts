import { Observable, Observer } from "../interfaces";
import { EventIds, ObserverFilter } from "./types";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";

export class ObserverHandler implements Observable {
  protected readonly observers: {
    observer: Observer;
    filter?: ObserverFilter;
  }[] = [];

  count() {
    return this.observers.length;
  }

  observe(observer: Observer, filter?: ObserverFilter): void {
    const index = this.observers.map((o) => o.observer).indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.observers.push({ observer: observer, filter: filter });
  }

  unObserve(observer: Observer): void {
    const index = this.observers.map((o) => o.observer).indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.observers.splice(index, 1);
  }

  async updateObservers(
    log: Logger,
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: any[]
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.observers
        .filter((o) => {
          const { filter } = o;
          if (!filter) return true;
          try {
            return filter(table, event, id);
          } catch (e: unknown) {
            log.error(
              `Failed to filter observer ${o.observer.toString()}: ${e}`
            );
            return false;
          }
        })
        .map((o) => o.observer.refresh(table, event, id, ...args))
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        log.error(
          `Failed to update observable ${this.observers[i].toString()}: ${result.reason}`
        );
    });
  }
}
