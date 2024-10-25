import {
  InjectableRegistryImp,
  Injectables,
} from "@decaf-ts/injectable-decorators";
import { Repository } from "./Repository";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { generateInjectableNameForRepository } from "./utils";
import { PersistenceKeys } from "../persistence/constants";
import { Adapter } from "../persistence/Adapter";

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
          if (injectable instanceof Repository) return injectable as T;
          const flavour =
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
