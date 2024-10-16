import {
  DBKeys,
  DBModel,
  getDBKey,
  InternalError,
} from "@decaf-ts/db-decorators";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Constructor, sf } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { getPersistenceKey } from "../persistence/decorators";
import { PersistenceKeys } from "../persistence/constants";

export function bootRepository<T extends DBModel>(
  model: Constructor<T>,
  original: Constructor<Repository<T>>,
): Repository<T> {
  const repo = Repository.forModel(model);
  console.log(repo);
  const injectableName: string | undefined = Reflect.getMetadata(
    getDBKey(DBKeys.REPOSITORY),
    model,
  );
  if (!injectableName)
    throw new InternalError(
      `No Repository defined for model ${model.constructor.name}`,
    );
  const flavour = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.ADAPTER),
    original,
  );
  if (!flavour)
    throw new InternalError(
      `Could not find persistence adapter definition for repository ${original.name}`,
    );
  try {
    const adapter = Adapter.get(flavour);
    return Injectables.get(injectableName, adapter) as Repository<T>;
  } catch (e: any) {
    throw new InternalError(e);
  }
}

export function getTableName<T extends DBModel>(model: T | Constructor<T>) {
  const metadata = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.TABLE),
    model instanceof DBModel ? model.constructor : model,
  );
  if (metadata) {
    return metadata;
  }
  if (model instanceof DBModel) {
    return model.constructor.name;
  }
  return model.name;
}

export function generateInjectableNameForRepository<T extends DBModel>(
  model: Constructor<T> | T,
  flavour?: string,
) {
  if (!flavour) {
    const key = getPersistenceKey(PersistenceKeys.ADAPTER);
    flavour = Reflect.getMetadata(
      key,
      model instanceof DBModel ? model.constructor : model,
    );
    if (!flavour)
      throw new InternalError(
        `Could not retrieve flavour from model ${model instanceof DBModel ? model.constructor.name : model.name}`,
      );
  }
  return sf(PersistenceKeys.INJECTABLE, flavour, getTableName(model));
}
