import {
  InternalError,
  OperationKeys,
  BulkCrudOperationKeys,
} from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Observable, Observer } from "../interfaces";
import { Adapter } from "./Adapter";
import { UnsupportedError } from "./errors";
import { Logger, Logging } from "@decaf-ts/logging";
import { EventIds } from "./types";

export class Dispatch<Y> implements Observable {
  protected adapter?: Adapter<Y, any, any, any>;
  protected native?: Y;
  protected models!: ModelConstructor<any>[];

  private logger!: Logger;

  protected get log() {
    if (!this.logger)
      this.logger = Logging.for(this as any).for(this.adapter as any);
    return this.logger;
  }

  constructor() {}

  protected initialize(): void {
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    const adapter = this.adapter as Adapter<Y, any, any, any>;
    (
      [
        OperationKeys.CREATE,
        OperationKeys.UPDATE,
        OperationKeys.DELETE,
        BulkCrudOperationKeys.CREATE_ALL,
        BulkCrudOperationKeys.UPDATE_ALL,
        BulkCrudOperationKeys.DELETE_ALL,
      ] as (keyof Adapter<Y, any, any, any>)[]
    ).forEach((method) => {
      if (!adapter[method])
        throw new InternalError(
          `Method ${method} not found in ${adapter.alias} adapter to bind Observables Dispatch`
        );

      let descriptor = Object.getOwnPropertyDescriptor(adapter, method);
      let proto: any = adapter;
      while (!descriptor && proto !== Object.prototype) {
        proto = Object.getPrototypeOf(proto);
        descriptor = Object.getOwnPropertyDescriptor(proto, method);
      }

      if (!descriptor || !descriptor.writable) {
        this.log.error(
          `Could not find method ${method} to bind Observables Dispatch`
        );
        return;
      }
      function bulkToSingle(method: string) {
        switch (method) {
          case BulkCrudOperationKeys.CREATE_ALL:
            return OperationKeys.CREATE;
          case BulkCrudOperationKeys.UPDATE_ALL:
            return OperationKeys.UPDATE;
          case BulkCrudOperationKeys.DELETE_ALL:
            return OperationKeys.DELETE;
          default:
            return method;
        }
      }
      // @ts-expect-error because there are read only properties
      adapter[method] = new Proxy(adapter[method], {
        apply: async (target: any, thisArg, argArray: any[]) => {
          const [tableName, ids] = argArray;
          const result = await target.apply(thisArg, argArray);
          this.updateObservers(tableName, bulkToSingle(method), ids as EventIds)
            .then(() => {
              this.log.verbose(
                `Observer refresh dispatched by ${method} for ${tableName}`
              );
              this.log.debug(`pks: ${ids}`);
            })
            .catch((e: unknown) =>
              this.log.error(
                `Failed to dispatch observer refresh for ${method} on ${tableName}: ${e}`
              )
            );
          return result;
        },
      });
    });
  }

  observe(observer: Adapter<Y, any, any, any>): void {
    if (!(observer instanceof Adapter))
      throw new UnsupportedError("Only Adapters can be observed by dispatch");
    this.adapter = observer;
    this.native = observer.native;
    this.models = Adapter.models(this.adapter.alias);
    this.initialize();
    this.log.verbose(`Dispatch initialized for ${this.adapter.alias} adapter`);
  }

  unObserve(observer: Observer): void {
    if (this.adapter !== observer)
      throw new UnsupportedError(
        "Only the adapter that was used to observe can be unobserved"
      );
    this.adapter = undefined;
  }

  async updateObservers(
    table: string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds
  ): Promise<void> {
    if (!this.adapter)
      throw new InternalError(`No adapter observed for dispatch`);
    try {
      await this.adapter.refresh(table, event, id);
    } catch (e: unknown) {
      throw new InternalError(`Failed to refresh dispatch: ${e}`);
    }
  }
}
