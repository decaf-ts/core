import { sf } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";

export function genAdapterInjectableKey(flavour: string) {
  return sf(PersistenceKeys.INJECTABLE, flavour);
}
