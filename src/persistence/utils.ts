import {
  Constructor,
  Model,
  ModelConstructor,
  ModelRegistry,
} from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "./constants";
import { Adapter } from "./Adapter";
import { DBKeys, InternalError } from "@decaf-ts/db-decorators";
import { Repository } from "../repository";

export function getColumnName<T extends Model>(model: T, attribute: string) {
  const metadata = Reflect.getMetadata(
    Adapter.key(PersistenceKeys.COLUMN),
    model,
    attribute
  );
  return metadata ? metadata : attribute;
}

export function getModelsByFlavour<M extends Model>(
  flavour: string
): Constructor<M>[] {
  try {
    const registry = (Model as any).getRegistry() as ModelRegistry<any>;
    const cache = (
      registry as unknown as { cache: Record<string, ModelConstructor<any>> }
    ).cache;
    const managedModels: ModelConstructor<any>[] = Object.values(cache)
      .map((m: ModelConstructor<M>) => {
        let f = Reflect.getMetadata(
          Adapter.key(PersistenceKeys.ADAPTER),
          m as ModelConstructor<any>
        );
        if (f && f === flavour) return m;
        if (!f) {
          const repo = Reflect.getMetadata(
            Repository.key(DBKeys.REPOSITORY),
            m as ModelConstructor<any>
          );
          if (!repo) return;
          const repository = Repository.forModel(m);

          f = Reflect.getMetadata(
            Adapter.key(PersistenceKeys.ADAPTER),
            repository
          );
          return f;
        }
      })
      .filter((m) => !!m);
    return managedModels;
  } catch (e: any) {
    throw new InternalError(e);
  }
}
