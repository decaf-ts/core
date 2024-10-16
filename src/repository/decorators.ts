import { inject, injectable } from "@decaf-ts/injectable-decorators";
import {
  DBKeys,
  DBModel,
  getDBKey,
  IRepository,
} from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { Constructor } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";
import { generateInjectableNameForRepository } from "./utils";
import { getPersistenceKey, PersistenceKeys } from "../persistence";

export function repository<T extends DBModel>(
  model: Constructor<T>,
  nameOverride?: string,
) {
  return (original: any, propertyKey?: string) => {
    if (propertyKey) {
      // const flavour = Reflect.getMetadata(
      //   getPersistenceKey(PersistenceKeys.ADAPTER),
      //   original.constructor,
      // );
      return inject(nameOverride || model.name)(original, propertyKey);
    }

    metadata(getDBKey(DBKeys.REPOSITORY), nameOverride || original.name)(model);
    Repository.register(nameOverride || original.name, original);
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
