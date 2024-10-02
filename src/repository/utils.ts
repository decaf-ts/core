import {
  DBKeys,
  DBModel,
  getDBKey,
  InternalError,
} from "@decaf-ts/db-decorators";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Constructor } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { getPersistenceKey } from "../persistence/decorators";
import { PersistenceKeys } from "../persistence/constants";

export function bootRepository<T extends DBModel>(
  model: Constructor<T>,
  original: (...args: any[]) => Repository<T>,
) {
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
    Injectables.get(injectableName, adapter);
  } catch (e: any) {
    throw new InternalError(e);
  }
  return injectableName;
}

export function getTableName<T extends DBModel>(model: T | any) {
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
