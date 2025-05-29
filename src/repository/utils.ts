import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor, sf } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";

/**
 * @description Generates a unique injectable name for a repository.
 * @summary Creates a standardized name for repository injectables based on model and adapter flavour.
 * @template T - The model type that extends Model.
 * @param {Constructor<T> | T} model - The model constructor or instance.
 * @param {string} [flavour] - Optional adapter flavour. If not provided, it will be retrieved from the model metadata.
 * @return {string} The generated injectable name.
 * @throws {InternalError} If no flavour is provided and none can be retrieved from the model.
 * @function generateInjectableNameForRepository
 * @memberOf module:core
 */
export function generateInjectableNameForRepository<T extends Model>(
  model: Constructor<T> | T,
  flavour?: string
) {
  if (!flavour) {
    const key = Adapter.key(PersistenceKeys.ADAPTER);
    flavour = Reflect.getMetadata(
      key,
      model instanceof Model ? model.constructor : model
    );
    if (!flavour)
      throw new InternalError(
        `Could not retrieve flavour from model ${model instanceof Model ? model.constructor.name : model.name}`
      );
  }
  return sf(PersistenceKeys.INJECTABLE, flavour, Repository.table(model));
}
