import { metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "./constants";

export function getPersistenceKey(key: string) {
  return PersistenceKeys.REFLECT + key;
}

export function uses(flavour: string) {
  return metadata(getPersistenceKey(PersistenceKeys.ADAPTER), flavour);
}
