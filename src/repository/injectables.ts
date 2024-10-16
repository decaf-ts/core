import {
  InjectableRegistryImp,
  Injectables,
} from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { bootRepository, generateInjectableNameForRepository } from "./utils";
import { DBModel } from "@decaf-ts/db-decorators";
import { getPersistenceKey, PersistenceKeys } from "../persistence";

export class InjectablesRegistry extends InjectableRegistryImp {
  constructor() {
    super();
  }

  get<T>(name: string): T | undefined {
    let injectable = super.get(name);
    if (!injectable)
      try {
        const m = Model.get(name);
        if (m) injectable = Repository.forModel(m);
        if (injectable) {
          const flavour =
            Reflect.getMetadata(
              getPersistenceKey(PersistenceKeys.ADAPTER),
              injectable.constructor,
            ) ||
            Reflect.getMetadata(
              getPersistenceKey(PersistenceKeys.ADAPTER),
              m as ModelConstructor<any>,
            );
          Injectables.register(
            injectable,
            generateInjectableNameForRepository(
              m as ModelConstructor<any>,
              flavour,
            ),
          );
        }
      } catch (e: any) {
        return undefined;
      }
    return injectable as T | undefined;
  }
}
