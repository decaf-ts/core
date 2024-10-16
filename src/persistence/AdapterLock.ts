import { Lock } from "@decaf-ts/transactional-decorators";
import { DBModel } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decorator-validation";
import { getTableName } from "../repository";

export class AdapterLock extends Lock {
  private readonly _cache: Record<string, Lock> = {};

  for<M extends DBModel>(table: string | Constructor<M> | M) {
    const tableName = typeof table === "string" ? table : getTableName(table);
    if (!(tableName in this._cache)) this._cache[tableName] = new Lock();
    return this._cache[tableName];
  }
}
