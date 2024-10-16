import { DBModel } from "@decaf-ts/db-decorators";
import { getTableName } from "../repository";

export function sequenceNameForModel<M extends DBModel>(
  model: M,
  ...args: string[]
) {
  return [getTableName(model), ...args, "sequence"].join("_");
}
