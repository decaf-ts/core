import {
  ConflictError,
  onCreate,
  onCreateUpdate,
  onDelete,
  onUpdate,
  afterAny,
} from "@decaf-ts/db-decorators";
import { apply, metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "../persistence/constants";
import { CascadeMetadata, IndexMetadata } from "../repository/types";
import { DefaultCascade, OrderDirection } from "../repository/constants";
import {
  Constructor,
  list,
  Model,
  propMetadata,
  type,
} from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { Repository } from "../repository/Repository";
import { Condition } from "../query/Condition";
import { RelationsMetadata } from "./types";
import {
  oneToManyOnCreate,
  oneToManyOnDelete,
  oneToManyOnUpdate,
  oneToOneOnCreate,
  oneToOneOnDelete,
  oneToOneOnUpdate,
  populate as pop,
} from "./construction";

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
  M extends Model,
  R extends Repository<M>,
  Y = any,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  if (!(model as any)[key]) return;
  const existing = await this.select()
    .where(Condition.attribute(key).eq((model as any)[key]))
    .execute<M[]>();
  if (existing.length)
    throw new ConflictError(
      `model already exists with property ${key} equal to ${JSON.stringify((model as any)[key], undefined, 2)}`
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
    onCreateUpdate(uniqueOnCreateUpdate),
    propMetadata(Repository.key(PersistenceKeys.UNIQUE), {})
  );
}

/**
 * @summary One To One relation Decorators
 *
 * @param {Constructor<any>} clazz the {@link Sequence} to use. Defaults to {@link NoneSequence}
 * @param {CascadeMetadata} [cascadeOptions]
 * @param {boolean} populate If true, replaces the specified key in the document with the corresponding record from the database
 *
 * @function onToOne
 *
 * @memberOf module:wallet-db.Decorators
 *
 * @see oneToMany
 * @see manyToOne
 */
export function oneToOne<M extends Model>(
  clazz: Constructor<M>,
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate: boolean = true
) {
  Model.register(clazz);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  return apply(
    type([clazz.name, String.name, Number.name, BigInt.name]),
    onCreate(oneToOneOnCreate, metadata),
    onUpdate(oneToOneOnUpdate, metadata),
    onDelete(oneToOneOnDelete, metadata),
    afterAny(pop, metadata),
    propMetadata(Repository.key(PersistenceKeys.ONE_TO_ONE), metadata)
  );
}

/**
 * @summary One To Many relation Decorators
 *
 * @param {Constructor<any>} clazz the {@link Sequence} to use. Defaults to {@link NoneSequence}
 * @param {CascadeMetadata} [cascadeOptions]
 *
 * @function oneToMany
 *
 * @memberOf module:wallet-db.Decorators
 *
 * @see oneToOne
 * @see manyToOne
 */
export function oneToMany<M extends Model>(
  clazz: Constructor<M>,
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate: boolean = true
) {
  Model.register(clazz);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  return apply(
    type([clazz.name, String.name, Number.name, BigInt.name]),
    onCreate(oneToManyOnCreate, metadata),
    onUpdate(oneToManyOnUpdate, metadata),
    onDelete(oneToManyOnDelete, metadata),
    afterAny(pop, metadata),
    propMetadata(Repository.key(PersistenceKeys.ONE_TO_MANY), metadata)
  );
}

/**
 * @summary Many To One relation Decorators
 *
 * @param {Constructor<any>} clazz the {@link Sequence} to use. Defaults to {@link NoneSequence}
 * @param {CascadeMetadata} [cascadeOptions]
 *
 * @function manyToOne
 *
 * @memberOf module:wallet-db.Decorators
 *
 * @see oneToMany
 * @see oneToOne
 */
export function manyToOne(
  clazz: Constructor<any>,
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate = true
) {
  Model.register(clazz);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  return apply(
    type([clazz.name, String.name, Number.name, BigInt.name]),
    // onCreate(oneToManyOnCreate, metadata),
    // onUpdate(oneToManyOnUpdate, metadata),
    // onDelete(oneToManyOnDelete, metadata),
    // afterAll(populate, metadata),
    propMetadata(Repository.key(PersistenceKeys.MANY_TO_ONE), metadata)
  );
}
