import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { DBKeys, IRepository } from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";

/**
 * @description Repository decorator for model classes.
 * @summary Creates and registers a repository for a model class. Can be used as both a property decorator and a class decorator.
 * @template T - The model type that extends Model.
 * @param {Constructor<T>} model - The constructor of the model class.
 * @param {string} [nameOverride] - Optional name override for the repository.
 * @return {any} - The decorator function.
 * @function repository
 * @mermaid
 * sequenceDiagram
 *   participant C as Client Code
 *   participant D as Decorator
 *   participant R as Repository
 *   participant M as Metadata
 *
 *   C->>D: Apply @repository(Model)
 *   alt Property Decorator
 *     D->>D: Check if propertyKey exists
 *     D->>+C: Return inject(name) decorator
 *   else Class Decorator
 *     D->>M: Set repository metadata on model
 *     D->>R: Register model with Repository
 *     D->>+C: Return injectable decorator with config
 *     C->>C: Define DBKeys.CLASS property
 *   end
 * @category Decorators
 */
export function repository<T extends Model>(
  model: Constructor<T>,
  nameOverride?: string
): any {
  return ((original: any, propertyKey?: any) => {
    if (propertyKey) {
      return inject(nameOverride || model.name)(original, propertyKey);
    }

    metadata(
      Repository.key(DBKeys.REPOSITORY),
      nameOverride || original.name
    )(model);
    Repository.register(model, original);
    return injectable(
      nameOverride || original.name,
      true,
      (instance: IRepository<T>) => {
        Object.defineProperty(instance, DBKeys.CLASS, {
          enumerable: false,
          configurable: false,
          writable: false,
          value: model,
        });
      }
    )(original);
  }) as any;
}
