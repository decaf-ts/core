import {
  Constructor,
  InjectableRegistryImp,
  Injectables,
} from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { generateInjectableNameForRepository } from "./utils";
import { PersistenceKeys } from "../persistence/constants";
import { Adapter } from "../persistence/Adapter";
import { Logger, Logging } from "@decaf-ts/logging";
import { Metadata } from "@decaf-ts/decoration";

/**
 * @description Registry for injectable repositories with auto-resolution.
 * @summary Provides an InjectableRegistry implementation that resolves repositories by model name or constructor. If a repository
 * is not explicitly registered, it attempts to infer the correct repository using model metadata and the active or specified adapter flavour.
 * @param {void} [constructor] No constructor parameters required; the superclass handles internal state.
 * @class InjectablesRegistry
 * @example
 * // Basic usage: retrieve a repository by model name
 * const registry = new InjectablesRegistry();
 * const userRepo = registry.get<UserRepository>('User');
 * // If UserRepository is registered, it will be returned. Otherwise, a repository will be created if a User model exists.
 *
 * // Retrieve by constructor and specify adapter flavour
 * const repoByCtor = registry.get<UserRepository>(UserModel, 'ram');
 *
 * // Retrieve by symbol (e.g., injectable token)
 * const token = Symbol.for('UserRepository');
 * const byToken = registry.get<UserRepository>(token);
 * @mermaid
 * sequenceDiagram
 *   participant C as Consumer
 *   participant R as InjectablesRegistry
 *   participant B as BaseRegistry
 *   participant M as Model
 *   participant A as Adapter
 *   participant RP as Repository
 *   C->>R: get(name, flavour?)
 *   activate R
 *   R->>B: super.get(name)
 *   alt Found in base registry
 *     B-->>R: injectable
 *     R-->>C: injectable
 *   else Not found
 *     R->>M: Model.get(name)
 *     alt Model found
 *       R->>A: resolve flavour (from arg/metadata/current)
 *       R->>RP: Repository.forModel(modelCtor, alias)
 *       alt Repository instance
 *         RP-->>R: repository instance
 *         R-->>C: repository instance
 *       else Repository ctor
 *         R->>A: Adapter.get(resolvedFlavour) or Adapter.current
 *         A-->>R: adapter instance
 *         R->>RP: new repoCtor(adapter, modelCtor)
 *         R-->>C: repository instance
 *       end
 *     else Model not found
 *       R-->>C: undefined
 *     end
 *   end
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
   * @description Retrieve an injectable with repository auto-resolution.
   * @summary Attempts to get an injectable from the base registry; if not found and the name refers to a known model, it
   * resolves the appropriate repository using the specified flavour or model metadata, falling back to the current adapter when needed.
   * @template T The injectable type to be returned.
   * @param {string | symbol | Constructor<T>} name Token, model name, or constructor associated with the injectable or model.
   * @param {string} [flavour] Optional adapter flavour (e.g., "ram"). If omitted, derives from metadata or current adapter.
   * @return {T | undefined} The located or auto-created injectable instance; otherwise undefined if it cannot be resolved.
   * @mermaid
   * sequenceDiagram
   *   participant G as get(name, flavour?)
   *   participant BR as BaseRegistry
   *   participant M as Model
   *   participant A as Adapter
   *   participant RP as Repository
   *   G->>BR: super.get(name)
   *   alt Found
   *     BR-->>G: injectable
   *   else Not found
   *     G->>M: derive modelCtor from name
   *     alt modelCtor resolved
   *       G->>A: resolve flavour (arg | metadata | current)
   *       G->>RP: Repository.forModel(modelCtor, alias)
   *       alt returns instance
   *         RP-->>G: Repository instance
   *       else returns ctor
   *         G->>A: Adapter.get(flavour) | Adapter.current
   *         A-->>G: adapter instance
   *         G->>RP: new repoCtor(adapter, modelCtor)
   *       end
   *     else no modelCtor
   *       G-->>G: return undefined
   *     end
   *   end
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
        flavour || (Metadata.get(modelCtor, metaKey) as string | undefined);
      // (Reflect.getMetadata(metaKey, modelCtor) as string | undefined);

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
          // (Reflect.getMetadata(metaKey, (injectable as any).constructor) as
          //   | string
          //   | undefined)
          (Metadata.get((injectable as any).constructor, metaKey) as
            | string
            | undefined) ||
          // (Reflect.getMetadata(metaKey, modelCtor) as string | undefined)
          (Metadata.get(modelCtor, metaKey) as string | undefined);
        Injectables.register(
          injectable,
          generateInjectableNameForRepository(
            modelCtor as ModelConstructor<any>,
            f as string
          )
        );
      } catch (e: unknown) {
        log.debug(
          `No registered repository or adapter found. falling back to default adapter. Error: ${(e as Error)?.message || JSON.stringify(e)}`
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
