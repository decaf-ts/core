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
import { Logger, Logging } from "@decaf-ts/logging";

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
  private logger?: Logger;

  protected get log(): Logger {
    if (!this.logger) this.logger = Logging.for(this as any);
    return this.logger;
  }

  constructor() {
    super();
  }

  /**
   * @description Gets an injectable by name with repository auto-resolution.
   * @summary Extends the base get method to automatically resolve repositories for models when not found directly.
   * @template T - The type of injectable to return.
   * @param {string | Constructor<T> | symbol} name - The name of the injectable to retrieve.
   * @param {string} [flavour] - the adapter flavour of the repository.
   * @return {T | undefined} - The injectable instance or undefined if not found.
   */
  override get<T>(
    name: symbol | Constructor<T> | string,
    flavour?: string
  ): T | undefined {
    const log = this.log.for(this.get);
    // First, try base registry, but guard against thrown errors
    let injectable: T | undefined;
    try {
      injectable = super.get(name as any);
    } catch {
      // do nothing. we handle it later
    }

    if (!injectable) {
      let modelCtor: Constructor<any> | undefined;
      if (typeof name === "function") modelCtor = name as Constructor<any>;
      else if (typeof name === "symbol" || typeof name === "string") {
        modelCtor = Model.get(name.toString()) as ModelConstructor<any>;
      }

      if (!modelCtor) return undefined;

      // Resolve flavour from metadata if not provided
      const metaKey = Adapter.key(PersistenceKeys.ADAPTER);
      const resolvedFlavour =
        flavour ||
        (Reflect.getMetadata(metaKey, modelCtor) as string | undefined);

      try {
        // Determine an alias to use: prefer a directly registered adapter; otherwise, if the current adapter
        // has the same flavour, use its alias to satisfy Repository.forModel/Adapter.get lookups.
        let aliasToUse = resolvedFlavour;
        try {
          if (resolvedFlavour) Adapter.get(resolvedFlavour);
        } catch {
          const current = Adapter.current as any;
          if (current && current.flavour === resolvedFlavour)
            aliasToUse = current.alias;
        }

        injectable = Repository.forModel(
          modelCtor as Constructor<any>,
          aliasToUse
        ) as T;
        if (injectable instanceof Repository) return injectable as T;

        // Otherwise, register the resolved injectable name for later retrieval
        const f =
          resolvedFlavour ||
          (Reflect.getMetadata(metaKey, (injectable as any).constructor) as
            | string
            | undefined) ||
          (Reflect.getMetadata(metaKey, modelCtor) as string | undefined);
        Injectables.register(
          injectable,
          generateInjectableNameForRepository(
            modelCtor as ModelConstructor<any>,
            f as string
          )
        );
      } catch (e: unknown) {
        log.debug(
          `No registered repository or adapter found. falling back to default adapter`
        );
        const repoCtor = (Repository as any)["get"](modelCtor, resolvedFlavour);
        if (typeof repoCtor === "function") {
          const adapter = resolvedFlavour
            ? (Adapter.get(resolvedFlavour) as any)
            : (Adapter.current as any);
          if (!adapter) return undefined;
          const instance = new repoCtor(adapter, modelCtor);
          return instance as T;
        }
      }
    }

    return injectable as T | undefined;
  }
}
