import { sf, Model } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";
import { Adapter } from "./Adapter";

export function genAdapterInjectableKey(flavour: string) {
  return sf(PersistenceKeys.INJECTABLE, flavour);
}

export function getColumnName<T extends Model>(model: T, attribute: string) {
  const metadata = Reflect.getMetadata(
    Adapter.key(PersistenceKeys.COLUMN),
    model,
    attribute
  );
  return metadata ? metadata : attribute;
}
