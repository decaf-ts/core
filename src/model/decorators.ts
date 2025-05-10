import {
  ConflictError,
  onCreate,
  onCreateUpdate,
  onDelete,
  onUpdate,
  afterAny,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { metadata } from "@decaf-ts/reflection";
import { PersistenceKeys } from "../persistence/constants";
import { CascadeMetadata, IndexMetadata } from "../repository/types";
import { DefaultCascade, OrderDirection } from "../repository/constants";
import {
  Constructor,
  Decoration,
  list,
  Model,
  prop,
  propMetadata,
  type,
} from "@decaf-ts/decorator-validation";
import { Adapter } from "../persistence/Adapter";
import { Repo, Repository } from "../repository/Repository";
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
import { User } from "./User";
import { Context } from "../repository/Context";
import { UnsupportedError } from "../persistence/errors";

export function table(tableName: string) {
  const key = Adapter.key(PersistenceKeys.TABLE);
  return metadata(key, tableName);
  // return Decoration.for(key).define(metadata(key, tableName)).apply();
}

export function column(columnName: string) {
  const key = Adapter.key(PersistenceKeys.COLUMN);
  return propMetadata(key, columnName);
  // return Decoration.for(key).define(propMetadata(key, columnName)).apply();
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
export function index(directions?: OrderDirection[], compositions?: string[]) {
  const key = Repository.key(
    `${PersistenceKeys.INDEX}${compositions && compositions.length ? `.${compositions.join(".")}` : ""}`
  );
  return Decoration.for(key)
    .define(
      propMetadata(key, {
        directions: directions,
        compositions: compositions,
      } as IndexMetadata)
    )
    .apply();
}

export async function uniqueOnCreateUpdate<
  M extends Model,
  R extends Repo<M, C, F>,
  V extends object,
  F extends RepositoryFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  if (!model[key]) return;
  const existing = await this.select()
    .where(Condition.attribute(key as string).eq(model[key]))
    .execute<M[]>();
  if (existing.length)
    throw new ConflictError(
      `model already exists with property ${key.toString()} equal to ${JSON.stringify(model[key], undefined, 2)}`
    );
}

/**
 * @summary Unique Decorator
 * @description Tags a property as unique.
 *  No other elements in that table can have the same property value
 *
 * @function unique
 *
 */
export function unique() {
  const key = Repository.key(PersistenceKeys.UNIQUE);
  return Decoration.for(key)
    .define(onCreateUpdate(uniqueOnCreateUpdate), propMetadata(key, {}))
    .apply();
}

export async function createdByOnCreateUpdate<
  M extends Model,
  R extends Repo<M, C, F>,
  V extends RelationsMetadata,
  F extends RepositoryFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const user: User | undefined = context.user;
  if (!user)
    throw new UnsupportedError(
      "This adapter does not support user identification"
    );
  model[key] = user.id as M[keyof M];
}

export function createdBy() {
  const key = Repository.key(PersistenceKeys.CREATED_BY);
  return Decoration.for(key)
    .define(onCreate(createdByOnCreateUpdate), propMetadata(key, {}))
    .apply();
}

export function updatedBy() {
  const key = Repository.key(PersistenceKeys.UPDATED_BY);
  return Decoration.for(key)
    .define(onCreateUpdate(createdByOnCreateUpdate), propMetadata(key, {}))
    .apply();
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
  const key = Repository.key(PersistenceKeys.ONE_TO_ONE);
  return Decoration.for(key)
    .define(
      prop(PersistenceKeys.RELATIONS),
      type([clazz.name, String.name, Number.name, BigInt.name]),
      onCreate(oneToOneOnCreate, metadata),
      onUpdate(oneToOneOnUpdate, metadata),
      onDelete(oneToOneOnDelete, metadata),
      afterAny(pop, metadata),
      propMetadata(key, metadata)
    )
    .apply();
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
  const key = Repository.key(PersistenceKeys.ONE_TO_MANY);
  return Decoration.for(key)
    .define(
      prop(PersistenceKeys.RELATIONS),
      // @ts-expect-error purposeful override
      list([clazz, String, Number, BigInt]),
      onCreate(oneToManyOnCreate, metadata),
      onUpdate(oneToManyOnUpdate, metadata),
      onDelete(oneToManyOnDelete, metadata),
      afterAny(pop, metadata),
      propMetadata(key, metadata)
    )
    .apply();
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
  const key = Repository.key(PersistenceKeys.MANY_TO_ONE);
  return Decoration.for(key)
    .define(
      prop(PersistenceKeys.RELATIONS),
      type([clazz.name, String.name, Number.name, BigInt.name]),
      // onCreate(oneToManyOnCreate, metadata),
      // onUpdate(oneToManyOnUpdate, metadata),
      // onDelete(oneToManyOnDelete, metadata),
      // afterAll(populate, metadata),
      propMetadata(Repository.key(PersistenceKeys.MANY_TO_ONE), metadata)
    )
    .apply();
}
