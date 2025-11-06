import {
  Constructor,
  inject,
  injectable,
} from "@decaf-ts/injectable-decorators";
import { DBKeys, IRepository } from "@decaf-ts/db-decorators";
import { Model, ModelKeys } from "@decaf-ts/decorator-validation";
import { Repository } from "./Repository";
import { Adapter, PersistenceKeys } from "../persistence";
import { Metadata, metadata } from "@decaf-ts/decoration";

/**
 * @description Repository decorator for model classes.
 * @summary Creates and registers a repository for a model class. Can be used as both a property decorator and a class decorator.
 * @template T - The model type that extends Model.
 * @param {Constructor<T>} model - The constructor of the model class.
 * @param {string} [flavour] - the required adapter's flavour/alias. If not provided, it will be retrieved from the model metadata..
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
  flavour?: string
): any {
  return ((original: any, propertyKey?: any) => {
    if (propertyKey) {
      return inject(model[ModelKeys.ANCHOR as keyof typeof model] || model)(
        original,
        propertyKey
      );
    }

    metadata(Repository.key(DBKeys.REPOSITORY), original.name)(model);
    flavour =
      flavour ||
      Metadata.get(original.constructor, Adapter.key(PersistenceKeys.ADAPTER));
    // Reflect.getMetadata(Adapter.key(PersistenceKeys.ADAPTER), original);
    Repository.register(
      model[ModelKeys.ANCHOR as keyof typeof model] || model,
      original,
      flavour
    );
    return injectable(model[ModelKeys.ANCHOR as keyof typeof model] || model, {
      callback: (instance: IRepository<T>) => {
        Object.defineProperty(instance, DBKeys.CLASS, {
          enumerable: false,
          configurable: false,
          writable: false,
          value: model,
        });
        return instance;
      },
    })(original);
  }) as any;
}
