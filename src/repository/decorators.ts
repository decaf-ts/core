import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { DBKeys, IRepository } from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";

export function repository<T extends Model>(
  model: Constructor<T>,
  nameOverride?: string
): any {
  return ((original: any, propertyKey?: any) => {
    if (propertyKey) {
      // const flavour = Reflect.getMetadata(
      //   getPersistenceKey(PersistenceKeys.ADAPTER),
      //   original.constructor,
      // );
      return inject(nameOverride || model.name)(original, propertyKey);
    }

    metadata(
      Repository.key(DBKeys.REPOSITORY),
      nameOverride || original.name
    )(model);
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
      }
    )(original);
  }) as any;
}
