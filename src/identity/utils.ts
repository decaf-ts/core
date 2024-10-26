import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";

export function getTableName<M extends Model>(model: M | Constructor<M>) {
  const metadata = Reflect.getMetadata(
    Adapter.key(PersistenceKeys.TABLE),
    model instanceof Model ? model.constructor : model
  );
  if (metadata) {
    return metadata;
  }
  if (model instanceof Model) {
    return model.constructor.name;
  }
  return model.name;
}

export function sequenceNameForModel<M extends Model>(
  model: M | Constructor<M>,
  ...args: string[]
) {
  return [getTableName(model), ...args].join("_");
}
