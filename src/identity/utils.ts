import { Model } from "@decaf-ts/decorator-validation";
import { getTableName } from "../repository/utils";

export function sequenceNameForModel<M extends Model>(
  model: M,
  ...args: string[]
) {
  return [getTableName(model), ...args].join("_");
}
