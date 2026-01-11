import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { AllOperationKeys, EventIds, ObserverFilter } from "./types";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import {
  ContextualArgs,
  ContextualLoggedClass,
} from "../utils/ContextualLoggedClass";
import { TransactionOperationKeys } from "./constants";
import { Repo } from "../repository/index";

export function onlyOnCreate(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, [
    OperationKeys.CREATE,
    BulkCrudOperationKeys.CREATE_ALL,
  ]);
}

export function onlyOnUpdate(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, [
    OperationKeys.UPDATE,
    BulkCrudOperationKeys.UPDATE_ALL,
  ]);
}

export function onlyOnDelete(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, [
    OperationKeys.DELETE,
    BulkCrudOperationKeys.DELETE_ALL,
  ]);
}

export function onlyOnTransactional(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, TransactionOperationKeys);
}

export function onlyOnSingle(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, Object.values(OperationKeys));
}

export function onlyOnBulk(clazz: ModelConstructor<any>) {
  return onlyOnFilter(clazz, Object.values(BulkCrudOperationKeys));
}

export function onlyOnFilter(
  clazz: ModelConstructor<any>,
  ops: AllOperationKeys[]
): ObserverFilter {
  return (
    table: Constructor | string,
    event: AllOperationKeys,
    id: EventIds,
    ...args: ContextualArgs<any>
  ) => {
    if (typeof clazz === "string")
      throw new InternalError(
        `clazz cannot be string. This should be impossible`
      );
    const { log } = ContextualLoggedClass.prototype["logCtx"](
      args,
      onlyOnFilter
    );
    log.silly(
      `filtering ${event} event for${table ? ` ${Model.tableName(table) || table}` : ``} ${id}`
    );
    return (
      (typeof table === "string"
        ? table === Model.tableName(clazz) || table === clazz.constructor.name
        : Metadata.constr(clazz) === Metadata.constr(table)) &&
      ops.includes(event)
    );
  };
}

export type AvailableFilters = typeof DefaultRepositoryFilters;

export const DefaultRepositoryFilters = {
  onlyOnCreate,
  onlyOnUpdate,
  onlyOnDelete,
  onlyOnTransactional,
  onlyOnSingle,
  onlyOnBulk,
};

export function getFilters<M extends Model>(
  repo: Repo<M>
): Record<keyof typeof DefaultRepositoryFilters, ObserverFilter> {
  const filters = Object.assign({}, DefaultRepositoryFilters);
  Object.entries(filters).forEach(([key, value]) => {
    (filters as any)[key] = value(repo.class) as ObserverFilter;
  });
  return filters as any;
}
