import {
  ConflictError,
  IRepository,
  NotFoundError,
  Repository,
} from "@decaf-ts/db-decorators";
import { apply, metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "../persistence/constants";
import { IndexMetadata } from "../repository/types";
import { OrderDirection } from "../repository/constants";
import { propMetadata } from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence";

export function table(tableName: string) {
  return metadata(Adapter.key(PersistenceKeys.TABLE), tableName);
}

export function column(columnName: string) {
  return propMetadata(Adapter.key(PersistenceKeys.COLUMN), columnName);
}

/**
 * @summary Index Decorator
 * @description properties decorated will the index in the
 * DB for performance in queries
 *
 * @param {OrderDirection[]} [directions]
 * @param {string[]} [compositions]
 *
 * @function index
 */
export function index(compositions?: string[], directions?: OrderDirection[]) {
  return propMetadata(
    Repository.key(
      `${PersistenceKeys.INDEX}${compositions && compositions.length ? `.${compositions.join(".")}` : ""}`
    ),
    {
      directions: directions,
      compositions: compositions,
    } as IndexMetadata
  );
}

export async function uniqueOnCreateUpdate<
  T extends Model,
  V extends IRepository<T>,
  Y = any,
>(this: V, data: Y, key: string, model: T): Promise<void> {
  if (!(model as any)[key]) return;
  try {
    await this.read((model as any)[key]);
  } catch (e: any) {
    if (e instanceof NotFoundError) return;
  }
  throw new ConflictError(
    `model already exists with ${key} equal to ${JSON.stringify((model as any)[key], undefined, 2)}`
  );
}

/**
 * @summary Unique Decorator
 * @description Tags a property as unique.
 *  No other elements in that table can have the same property value
 *
 * @function unique
 *
 * @memberOf module:wallet-db.Decorators
 */
export function unique() {
  return apply(
    // onCreateUpdate(uniqueOnCreateUpdate),
    propMetadata(Repository.key(PersistenceKeys.UNIQUE), {})
  );
}
