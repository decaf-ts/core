import {
  inject,
  injectable,
  Injectables,
} from "@decaf-ts/injectable-decorators";
import {
  DBKeys,
  DBModel,
  getDBKey,
  IRepository,
} from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { Constructor } from "@decaf-ts/decorator-validation";
import { bootRepository } from "./utils";

export function repository<T extends DBModel>(
  model: Constructor<T>,
  nameOverride?: string,
) {
  return (original: any, propertyKey?: string) => {
    if (propertyKey) {
      const injectableName = bootRepository(model, original);
      return inject(injectableName)(original, propertyKey);
    }

    metadata(getDBKey(DBKeys.REPOSITORY), nameOverride || original.name)(model);
    return injectable(
      nameOverride || original.name,
      true,
      (instance: IRepository<T>) => {
        Object.defineProperty(instance, DBKeys.CLASS, {
          enumerable: false,
          configurable: false,
          writable: false,
          value: model,
        });
      },
    )(original);
  };
}
