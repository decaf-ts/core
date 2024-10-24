import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository/Repository";

export function sequenceNameForModel<M extends Model>(
  model: M,
  ...args: string[]
) {
  return [Repository.table(model), ...args].join("_");
}
