import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { DBKeys, IRepository, RepositoryFlags } from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";
import { Context } from "./Context";

export function repository<
  M extends Model,
  F extends RepositoryFlags = RepositoryFlags,
  C extends Context<F> = Context<F>,
>(model: Constructor<M>, nameOverride?: string): any {
  return ((original: any, propertyKey?: any) => {
    if (propertyKey) {
      return inject(nameOverride || model.name)(original, propertyKey);
    }

    metadata(
      Repository.key(DBKeys.REPOSITORY),
      nameOverride || original.name
    )(model);
    Repository.register(model, original);
    return injectable(
      nameOverride || original.name,
      true,
      (instance: IRepository<M, F, C>) => {
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
