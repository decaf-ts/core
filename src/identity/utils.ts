import { Constructor, Model, ModelKeys } from "@decaf-ts/decorator-validation";
import { InternalError, Repository } from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Adapter } from "../persistence/index";

/**
 * @description Gets the table name for a model
 * @summary Retrieves the table name associated with a model by checking metadata or falling back to the constructor name
 * @template M - Type that extends Model
 * @param {M | Constructor<M>} model - The model instance or constructor to get the table name for
 * @return {string} The table name for the model
 * @function getTableName
 * @memberOf module:core
 */
export function getTableName<M extends Model>(
  model: M | Constructor<M>
): string {
  const obj =
    model instanceof Model ? Model.get(model.constructor.name) : model;

  if (!obj) throw new InternalError(`Unable to find model ${model}`);

  const metadata = Reflect.getOwnMetadata(
    Adapter.key(PersistenceKeys.TABLE),
    obj[ModelKeys.MODEL as unknown as keyof typeof obj] || obj
  );

  if (metadata) {
    return metadata;
  }
  if (model instanceof Model) {
    return model.constructor.name;
  }
  return model.name;
}

export function getColumnName<M extends Model>(
  model: M,
  attribute: string
): string {
  const metadata = Reflect.getMetadata(
    Repository.key(PersistenceKeys.COLUMN),
    model,
    attribute
  );
  return metadata ? metadata : attribute;
}

/**
 * @description Generates a sequence name for a model
 * @summary Creates a standardized sequence name by combining the table name with additional arguments
 * @template M - Type that extends Model
 * @param {M | Constructor<M>} model - The model instance or constructor to generate the sequence name for
 * @param {...string} args - Additional string arguments to append to the sequence name
 * @return {string} The generated sequence name
 * @function sequenceNameForModel
 * @memberOf module:core
 */
export function sequenceNameForModel<M extends Model>(
  model: M | Constructor<M>,
  ...args: string[]
) {
  return [getTableName(model), ...args].join("_");
}
