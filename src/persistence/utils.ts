import { sf } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";
import { DBModel } from "@decaf-ts/db-decorators";
import { getPersistenceKey } from "./decorators";

export function genAdapterInjectableKey(flavour: string) {
  return sf(PersistenceKeys.INJECTABLE, flavour);
}

export function getColumnName<T extends DBModel>(model: T, attribute: string) {
  const metadata = Reflect.getMetadata(
    getPersistenceKey(PersistenceKeys.COLUMN),
    model,
    attribute,
  );
  return metadata ? metadata : attribute;
}
