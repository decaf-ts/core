import { injectable } from "@decaf-ts/injectable-decorators";
import { metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "./constants";
import { genAdapterInjectableKey } from "./utils";

export function getPersistenceKey(key: string) {
  return PersistenceKeys.REFLECT + key;
}

export function adapter(flavour: string) {
  return injectable(genAdapterInjectableKey(flavour), true);
}

export function uses(flavour: string) {
  return metadata(
    getPersistenceKey(PersistenceKeys.ADAPTER),
    genAdapterInjectableKey(flavour),
  );
}
