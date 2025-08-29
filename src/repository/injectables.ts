import {
  InjectableRegistryImp,
  Injectables,
} from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import {
  Constructor,
  Model,
  ModelConstructor,
} from "@decaf-ts/decorator-validation";
import { generateInjectableNameForRepository } from "./utils";
import { PersistenceKeys } from "../persistence/constants";
import { Adapter } from "../persistence/Adapter";

/**
 * @description Registry for injectable repositories.
 * @summary Extends the base injectable registry to provide automatic repository resolution for models.
 * @param {void} - No constructor parameters required.
 * @class InjectablesRegistry
 * @example
 * const registry = new InjectablesRegistry();
 * const userRepo = registry.get<UserRepository>('User');
 * // If UserRepository exists, it will be returned
 * // If not, but User model exists, a repository will be created for it
 */
export class InjectablesRegistry extends InjectableRegistryImp {
  constructor() {
    super();
  }

  /**
   * @description Gets an injectable by name with repository auto-resolution.
   * @summary Extends the base get method to automatically resolve repositories for models when not found directly.
   * @template T - The type of injectable to return.
   * @param {string} name - The name of the injectable to retrieve.
   * @return {T | undefined} - The injectable instance or undefined if not found.
   */
  override get<T>(
    name: symbol | Constructor<T>,
    flavour?: string
  ): T | undefined {
    let injectable = super.get(name);
    if (!injectable)
      try {
        let m = name;
        if (typeof name === "symbol" || typeof name === "string") {
          m = Model.get(name.toString()) as ModelConstructor<any>;
        }
        if (m)
          injectable = Repository.forModel(m as Constructor<any>, flavour) as T;
        if (injectable) {
          if (injectable instanceof Repository) return injectable as T;
          flavour =
            flavour ||
            Reflect.getMetadata(
              Adapter.key(PersistenceKeys.ADAPTER),
              injectable.constructor
            ) ||
            Reflect.getMetadata(
              Adapter.key(PersistenceKeys.ADAPTER),
              m as ModelConstructor<any>
            );
          Injectables.register(
            injectable,
            generateInjectableNameForRepository(
              m as ModelConstructor<any>,
              flavour
            )
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: any) {
        return undefined;
      }
    return injectable as T | undefined;
  }
}
