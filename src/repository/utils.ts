import { InternalError } from "@decaf-ts/db-decorators";
import { sf } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { Model } from "@decaf-ts/decorator-validation";
import { getTableName } from "../identity/utils";
import { Constructor, Metadata } from "@decaf-ts/decoration";

/**
 * @description Generates a unique injectable name for a repository.
 * @summary Creates a standardized injectable token for repositories using the adapter flavour and model table name.
 * This helps the DI system register and resolve repository instances consistently across adapters.
 * @template T The model type that extends Model.
 * @param {Constructor<T> | T} model The model constructor or instance from which to derive the table name.
 * @param {string} [flavour] Optional adapter flavour/alias. If omitted, it is read from model metadata.
 * @return {string} A namespaced injectable token for the repository (e.g., "db:repo:ram:users").
 * @throws {InternalError} If the flavour cannot be determined from arguments or metadata.
 * @function generateInjectableNameForRepository
 * @mermaid
 * sequenceDiagram
 *   participant C as Caller
 *   participant U as generateInjectableNameForRepository
 *   participant R as Reflect Metadata
 *   participant A as Adapter
 *   participant S as String Formatter
 *   C->>U: call(model, flavour?)
 *   alt flavour provided
 *     U-->>U: use provided flavour
 *   else flavour not provided
 *     U->>A: Adapter.key(ADAPTER)
 *     U->>R: getMetadata(key, model|model.ctor)
 *     alt metadata present
 *       R-->>U: flavour
 *     else missing
 *       U-->>C: throw InternalError
 *     end
 *   end
 *   U->>S: sf(INJECTABLE, flavour, Repository.table(model))
 *   S-->>C: token string
 * @memberOf module:core
 */
export function generateInjectableNameForRepository<T extends Model>(
  model: Constructor<T> | T,
  flavour?: string
): string {
  if (!flavour) {
    const key = Adapter.key(PersistenceKeys.ADAPTER);
    flavour = Reflect.getMetadata(
      key,
      model instanceof Model ? model.constructor : model
    );
    // const meta = Metadata.get(
    //   model instanceof Model ? model.constructor : (model as any)
    // );

    // TODO: Find why flavour can be found in reflect, but not in metadata
    // flavour = Metadata.get(
    //   model instanceof Model ? model.constructor : (model as any),
    //   Adapter.key(PersistenceKeys.ADAPTER)
    // );
    if (!flavour)
      throw new InternalError(
        `Could not retrieve flavour from model ${model instanceof Model ? model.constructor.name : model.name}`
      );
  }
  return sf(PersistenceKeys.INJECTABLE, flavour, getTableName(model));
}
