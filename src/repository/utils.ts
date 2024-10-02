import {
  DBKeys,
  DBModel,
  getDBKey,
  InternalError,
} from "@decaf-ts/db-decorators";
import { Adapter, getPersistenceKey, PersistenceKeys } from "../persistence";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Constructor } from "@decaf-ts/decorator-validation";

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

export function getTableName<T extends DBModel>(model: T | Constructor<T>) {
  const metadata = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.TABLE),
    model.constructor,
  );
  return metadata ? metadata : model.constructor.name;
}
