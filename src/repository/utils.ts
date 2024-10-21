import { DBKeys, InternalError } from "@decaf-ts/db-decorators";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Constructor, sf } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { getPersistenceKey } from "../persistence/decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Model } from "@decaf-ts/decorator-validation";

export function bootRepository<T extends Model>(
  model: Constructor<T>,
  original: Constructor<Repository<T>>
): Repository<T> {
  const repo = Repository.forModel(model);
  console.log(repo);
  const injectableName: string | undefined = Reflect.getMetadata(
    Repository.key(DBKeys.REPOSITORY),
    model
  );
  if (!injectableName)
    throw new InternalError(
      `No Repository defined for model ${model.constructor.name}`
    );
  const flavour = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.ADAPTER),
    original
  );
  if (!flavour)
    throw new InternalError(
      `Could not find persistence adapter definition for repository ${original.name}`
    );
  try {
    const adapter = Adapter.get(flavour);
    return Injectables.get(injectableName, adapter) as Repository<T>;
  } catch (e: any) {
    throw new InternalError(e);
  }
}

export function getTableName<T extends Model>(model: T | Constructor<T>) {
  const metadata = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.TABLE),
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
    const key = getPersistenceKey(PersistenceKeys.ADAPTER);
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
