import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor, sf } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { Model } from "@decaf-ts/decorator-validation";

export function getTableName<T extends Model>(model: T | Constructor<T>) {
  const metadata = Reflect.getMetadata(
    Adapter.key(PersistenceKeys.TABLE),
    model instanceof Model ? model.constructor : model
  );
  if (metadata) {
    return metadata;
  }
  if (model instanceof Model) {
    return model.constructor.name;
  }
  return model.name;
}

export function generateInjectableNameForRepository<T extends Model>(
  model: Constructor<T> | T,
  flavour?: string
) {
  if (!flavour) {
    const key = Adapter.key(PersistenceKeys.ADAPTER);
    flavour = Reflect.getMetadata(
      key,
      model instanceof Model ? model.constructor : model
    );
    if (!flavour)
      throw new InternalError(
        `Could not retrieve flavour from model ${model instanceof Model ? model.constructor.name : model.name}`
      );
  }
  return sf(PersistenceKeys.INJECTABLE, flavour, getTableName(model));
}
