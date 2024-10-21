import { metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "./constants";
import { Adapter } from "./Adapter";

export function uses(flavour: string) {
  return metadata(Adapter.key(PersistenceKeys.ADAPTER), flavour);
}
