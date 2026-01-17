import {
  afterAny,
  ConflictError,
  onCreate,
  onCreateUpdate,
  onDelete,
  onUpdate,
  generated,
  OperationKeys,
  timestamp,
  afterUpdate,
} from "@decaf-ts/db-decorators";
import {
  apply as newApply,
  Metadata,
  metadata as newMetadata,
  Decoration,
  propMetadata,
  Constructor,
  prop,
  metadata,
  apply,
} from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/constants";
import { CascadeMetadata, IndexMetadata } from "../repository/types";
import { DefaultCascade, OrderDirection } from "../repository/constants";
import { async, list, Model, type } from "@decaf-ts/decorator-validation";
import type { Repo } from "../repository/Repository";
import { Condition } from "../query/Condition";
import {
  JoinColumnOptions,
  JoinTableMultipleColumnsOptions,
  JoinTableOptions,
  RelationsMetadata,
} from "./types";
import {
  cascadeDelete,
  oneToManyOnCreate,
  oneToManyOnDelete,
  oneToManyOnUpdate,
  oneToOneOnCreate,
  oneToOneOnDelete,
  oneToOneOnUpdate,
  populate as pop,
} from "./construction";
import { AuthorizationError } from "../utils/errors";
import { ContextOf } from "../persistence/types";

/**
 * @description Specifies the database table name for a model
 * @summary Decorator that sets the table name for a model class in the database
 * @param {string} opts - The name of the table in the database
 * @return {Function} A decorator function that can be applied to a class
 * @function table
 * @category Class Decorators
 */
export function table<OPTS = string>(opts?: OPTS) {
  return Decoration.for(PersistenceKeys.TABLE)
    .define({
      decorator: function table(opts: OPTS) {
        return function table(target: any) {
          Metadata.set(
            PersistenceKeys.TABLE,
            opts || target.name.toLowerCase(),
            target
          );
          return metadata(
            PersistenceKeys.TABLE,
            opts || target.name.toLowerCase()
          )(target);
        };
      },
      args: [opts],
    })
    .apply();
}

/**
 * @description Specifies the database column name for a model property
 * @summary Decorator that maps a model property to a specific column name in the database
 * @param {string} columnName - The name of the column in the database
 * @return {Function} A decorator function that can be applied to a class property
 * @function column
 * @category Property Decorators
 */
export function column<OPTS = string>(columnName?: OPTS) {
  return Decoration.for(PersistenceKeys.COLUMN)
    .define({
      decorator: function column(c) {
        return function column(obj: any, attr: any) {
          return propMetadata(
            Metadata.key(PersistenceKeys.COLUMN, attr),
            c || attr
          )(obj, attr);
        };
      },
      args: [columnName],
    })
    .apply();
}

/**
 * @description Creates an index on a model property for improved query performance
 * @summary Decorator that marks a property to be indexed in the database, optionally with specific directions and compositions
 * @param {OrderDirection[]} [directions] - Optional array of sort directions for the index
 * @param {string[]} [compositions] - Optional array of property names to create a composite index
 * @return {Function} A decorator function that can be applied to a class property
 * @function index
 * @category Property Decorators
 */
export function index(): ReturnType<typeof propMetadata>;
export function index(name: string): ReturnType<typeof propMetadata>;
export function index(
  directions: OrderDirection[]
): ReturnType<typeof propMetadata>;
export function index(
  directions: OrderDirection[],
  name: string
): ReturnType<typeof propMetadata>;
export function index(compositions: string[]): ReturnType<typeof propMetadata>;
export function index(
  compositions: string[],
  name: string
): ReturnType<typeof propMetadata>;
export function index(
  directions?: OrderDirection[] | string[] | string,
  compositions?: string[] | string,
  name?: string
) {
  function index(
    directions?: OrderDirection[] | string[] | string,
    compositions?: string[] | string,
    name?: string
  ) {
    return function index(obj: any, attr: any) {
      if (typeof directions === "string") {
        name = directions;
        directions = undefined;
        compositions = undefined;
      }
      if (typeof compositions === "string") {
        name = compositions;
        compositions = undefined;
      }
      if (!compositions && directions) {
        if (
          directions.find(
            (d) => ![OrderDirection.ASC, OrderDirection.DSC].includes(d as any)
          )
        ) {
          compositions = directions as string[];
          directions = undefined;
        }
      }

      return propMetadata(
        Metadata.key(
          `${PersistenceKeys.INDEX}${compositions && compositions?.length ? `.${compositions.join(".")}` : ""}`,
          attr
        ),
        {
          directions: directions,
          compositions: compositions,
          name: name,
        } as IndexMetadata
      )(obj, attr);
    };
  }

  return Decoration.for(PersistenceKeys.INDEX)
    .define({
      decorator: index,
      args: [directions, compositions, name],
    })
    .apply();
}

/**
 * @description Enforces uniqueness constraint during model creation and update
 * @summary Internal function used by the unique decorator to check if a property value already exists in the database
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The metadata type
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The metadata for the property
 * @param key - The property key to check for uniqueness
 * @param {M} model - The model instance being created or updated
 * @return {Promise<void>} A promise that resolves when the check is complete or rejects with a ConflictError
 * @function uniqueOnCreateUpdate
 * @memberOf module:core
 */
export async function uniqueOnCreateUpdate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: object,
  key: keyof M,
  model: M
): Promise<void> {
  if (!(model as any)[key]) return;
  const existing = await this.select()
    .where(Condition.attribute(key).eq(model[key]))
    .execute();
  if (existing.length)
    throw new ConflictError(
      `model already exists with property ${key as string} equal to ${JSON.stringify((model as any)[key], undefined, 2)}`
    );
}

/**
 * @description Tags a property as unique
 * @summary Decorator that ensures a property value is unique across all instances of a model in the database
 * @return {Function} A decorator function that can be applied to a class property
 * @function unique
 * @category Property Decorators
 * @example
 * ```typescript
 * class User extends BaseModel {
 *   @unique()
 *   @required()
 *   username!: string;
 * }
 * ```
 */
export function unique() {
  const key = PersistenceKeys.UNIQUE;
  return Decoration.for(key)
    .define(
      async(),
      onCreateUpdate(uniqueOnCreateUpdate),
      propMetadata(key, {})
    )
    .apply();
}

/**
 * @description Handles user identification for ownership tracking
 * @summary Internal function used by the createdBy and updatedBy decorators to set ownership information
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The metadata for the property
 * @param key - The property key to store the user identifier
 * @param {M} model - The model instance being created or updated
 * @return {Promise<void>} A promise that rejects with an AuthorizationError if user identification is not supported
 * @function createdByOnCreateUpdate
 * @memberOf module:core
 */
export async function createdByOnCreateUpdate<
  M extends Model,
  R extends Repo<M>,
>(
  this: R,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: ContextOf<R>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  data: RelationsMetadata,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  key: keyof M,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  model: M
): Promise<void> {
  throw new AuthorizationError(
    "This adapter does not support user identification"
  );
}

/**
 * @description Tracks the creator of a model instance
 * @summary Decorator that marks a property to store the identifier of the user who created the model instance
 * @return {Function} A decorator function that can be applied to a class property
 * @function createdBy
 * @category Property Decorators
 * @example
 * ```typescript
 * class Document extends BaseModel {
 *   @createdBy()
 *   creator!: string;
 * }
 * ```
 */
export function createdBy() {
  function createdBy() {
    return function createdBy(target: object, prop?: any) {
      return apply(
        onCreate(createdByOnCreateUpdate),
        propMetadata(PersistenceKeys.CREATED_BY, prop),
        generated(PersistenceKeys.CREATED_BY)
      )(target, prop);
    };
  }

  return Decoration.for(PersistenceKeys.CREATED_BY)
    .define({
      decorator: createdBy,
      args: [],
    })
    .apply();
}

/**
 * @description Tracks the last updater of a model instance
 * @summary Decorator that marks a property to store the identifier of the user who last updated the model instance
 * @return {Function} A decorator function that can be applied to a class property
 * @function updatedBy
 * @category Property Decorators
 * @example
 * ```typescript
 * class Document extends BaseModel {
 *   @updatedBy()
 *   lastEditor!: string;
 * }
 * ```
 */
export function updatedBy() {
  function updatedBy() {
    return function updatedBy(target: object, prop?: any) {
      return apply(
        onUpdate(createdByOnCreateUpdate),
        propMetadata(PersistenceKeys.UPDATED_BY, prop),
        generated(PersistenceKeys.UPDATED_BY)
      )(target, prop);
    };
  }
  return Decoration.for(PersistenceKeys.UPDATED_BY)
    .define({
      decorator: updatedBy,
      args: [],
    })
    .apply();
}

export function createdAt() {
  return timestamp([OperationKeys.CREATE]);
}

export function updatedAt() {
  return timestamp();
}

export function getPkTypes(model: Constructor | (() => Constructor)) {
  const resolvedClazz =
    typeof model === "function" && model.name
      ? (model as Constructor)
      : (model as () => Constructor)();
  const pk = Model.pk(resolvedClazz as Constructor);
  return (
    Metadata.allowedTypes(resolvedClazz as Constructor, pk as string) || []
  );
}

/**
 * @description Defines a one-to-one relationship between models
 * @summary Decorator that establishes a one-to-one relationship between the current model and another model
 * @template M - The related model type extending Model
 * @param {Constructor<M>} clazz - The constructor of the related model class
 * @param {CascadeMetadata} [cascadeOptions=DefaultCascade] - Options for cascading operations (create, update, delete)
 * @param {boolean} [populate=true] - If true, automatically populates the relationship when the model is retrieved
 * @return {Function} A decorator function that can be applied to a class property
 * @function oneToOne
 * @category Property Decorators
 * @example
 * ```typescript
 * class User extends BaseModel {
 *   @oneToOne(Profile)
 *   profile!: string | Profile;
 * }
 *
 * class Profile extends BaseModel {
 *   @required()
 *   bio!: string;
 * }
 * ```
 * @see oneToMany
 * @see manyToOne
 */
export function oneToOne<M extends Model>(
  clazz: Constructor<M> | (() => Constructor<M>),
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate: boolean = true,
  joinColumnOpts?: JoinColumnOptions,
  fk?: string
) {
  const key = PersistenceKeys.ONE_TO_ONE;
  function oneToOneDec(
    clazz: Constructor<M> | (() => Constructor<M>),
    cascade: CascadeMetadata,
    populate: boolean,
    joinColumnOpts?: JoinColumnOptions,
    fk?: string
  ) {
    const meta: RelationsMetadata = {
      class: clazz,
      cascade: cascade,
      populate: populate,
    };
    if (joinColumnOpts) meta.joinTable = joinColumnOpts;
    if (fk) meta.name = fk;
    const pkTypes = getPkTypes(clazz);
    const decs = [
      prop(),
      relation(key, meta),
      type([clazz, ...pkTypes]),
      onCreate(oneToOneOnCreate, meta),
      onUpdate(oneToOneOnUpdate, meta),
      onDelete(oneToOneOnDelete, meta),
      afterUpdate(cascadeDelete, meta),
      afterAny(pop, meta),
    ];
    return apply(...decs);
  }

  return Decoration.for(key)
    .define({
      decorator: oneToOneDec,
      args: [clazz, cascadeOptions, populate, joinColumnOpts, fk],
    })
    .apply();
}

/**
 * @description Defines a one-to-many relationship between models
 * @summary Decorator that establishes a one-to-many relationship between the current model and multiple instances of another model
 * @template M - The related model type extending Model
 * @param {Constructor<M>} clazz - The constructor of the related model class
 * @param {CascadeMetadata} [cascadeOptions=DefaultCascade] - Options for cascading operations (create, update, delete)
 * @param {boolean} [populate=true] - If true, automatically populates the relationship when the model is retrieved
 * @return {Function} A decorator function that can be applied to a class property
 * @function oneToMany
 * @category Property Decorators
 * @example
 * ```typescript
 * class Author extends BaseModel {
 *   @required()
 *   name!: string;
 *
 *   @oneToMany(Book)
 *   books!: string[] | Book[];
 * }
 *
 * class Book extends BaseModel {
 *   @required()
 *   title!: string;
 * }
 * ```
 * @see oneToOne
 * @see manyToOne
 */
export function oneToMany<M extends Model>(
  clazz: Constructor<M> | (() => Constructor<M>),
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate: boolean = true,
  joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
  fk?: string
) {
  const key = PersistenceKeys.ONE_TO_MANY;

  function oneToManyDec(
    clazz: Constructor<M> | (() => Constructor<M>),
    cascade: CascadeMetadata,
    populate: boolean,
    joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
    fk?: string
  ) {
    const metadata: RelationsMetadata = {
      class: clazz,
      cascade: cascade,
      populate: populate,
    };
    if (joinTableOpts) metadata.joinTable = joinTableOpts;
    if (fk) metadata.name = fk;
    const pkTypes = getPkTypes(clazz);
    const decs = [
      prop(),
      relation(key, metadata),
      list([clazz, ...pkTypes]),
      onCreate(oneToManyOnCreate, metadata),
      onUpdate(oneToManyOnUpdate, metadata),
      onDelete(oneToManyOnDelete, metadata),
      afterUpdate(cascadeDelete, metadata),
      afterAny(pop, metadata),
    ];
    return apply(...decs);
  }

  return Decoration.for(key)
    .define({
      decorator: oneToManyDec,
      args: [clazz, cascadeOptions, populate, joinTableOpts, fk],
    })
    .apply();
}

/**
 * @description Defines a many-to-one relationship between models
 * @summary Decorator that establishes a many-to-one relationship between multiple instances of the current model and another model
 * @template M - The related model type extending Model
 * @param {Constructor<M>} clazz - The constructor of the related model class
 * @param {CascadeMetadata} [cascadeOptions=DefaultCascade] - Options for cascading operations (create, update, delete)
 * @param {boolean} [populate=true] - If true, automatically populates the relationship when the model is retrieved
 * @return {Function} A decorator function that can be applied to a class property
 * @function manyToOne
 * @category Property Decorators
 * @example
 * ```typescript
 * class Book extends BaseModel {
 *   @required()
 *   title!: string;
 *
 *   @manyToOne(Author)
 *   author!: string | Author;
 * }
 *
 * class Author extends BaseModel {
 *   @required()
 *   name!: string;
 * }
 * ```
 * @see oneToMany
 * @see oneToOne
 */
export function manyToOne<M extends Model>(
  clazz: Constructor<M> | (() => Constructor<M>),
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate = true,
  joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
  fk?: string
) {
  // Model.register(clazz as Constructor<M>);
  const key = PersistenceKeys.MANY_TO_ONE;

  function manyToOneDec(
    clazz: Constructor<M> | (() => Constructor<M>),
    cascade: CascadeMetadata,
    populate: boolean,
    joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
    fk?: string
  ) {
    const metadata: RelationsMetadata = {
      class: clazz,
      cascade: cascade,
      populate: populate,
    };
    if (joinTableOpts) metadata.joinTable = joinTableOpts;
    if (fk) metadata.name = fk;
    const pkTypes = getPkTypes(clazz);
    const decs = [
      prop(),
      relation(key, metadata),
      type([clazz, ...pkTypes]),
      // onCreate(oneToManyOnCreate, metadata),
      // onUpdate(oneToManyOnUpdate, metadata),
      // onDelete(oneToManyOnDelete, metadata),
      // afterAny(pop, metadata),
    ];
    return apply(...decs);
  }

  return Decoration.for(key)
    .define({
      decorator: manyToOneDec,
      args: [clazz, cascadeOptions, populate, joinTableOpts, fk],
    })
    .apply();
}

/**
 * @description Defines a many-to-one relationship between models
 * @summary Decorator that establishes a many-to-one relationship between multiple instances of the current model and another model
 * @template M - The related model type extending Model
 * @param {Constructor<M>} clazz - The constructor of the related model class
 * @param {CascadeMetadata} [cascadeOptions=DefaultCascade] - Options for cascading operations (create, update, delete)
 * @param {boolean} [populate=true] - If true, automatically populates the relationship when the model is retrieved
 * @return {Function} A decorator function that can be applied to a class property
 * @function manyToOne
 * @category Property Decorators
 * @example
 * ```typescript
 * class Book extends BaseModel {
 *   @required()
 *   title!: string;
 *
 *   @manyToOne(Author)
 *   author!: string | Author;
 * }
 *
 * class Author extends BaseModel {
 *   @required()
 *   name!: string;
 * }
 * ```
 * @see oneToMany
 * @see oneToOne
 */
export function manyToMany<M extends Model>(
  clazz: Constructor<M> | (() => Constructor<M>),
  cascadeOptions: CascadeMetadata = DefaultCascade,
  populate = true,
  joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
  fk?: string
) {
  // Model.register(clazz as Constructor<M>);
  const key = PersistenceKeys.MANY_TO_MANY;

  function manyToManyDec(
    clazz: Constructor<M> | (() => Constructor<M>),
    cascade: CascadeMetadata,
    populate: boolean,
    joinTableOpts?: JoinTableOptions | JoinTableMultipleColumnsOptions,
    fk?: string
  ) {
    const metadata: RelationsMetadata = {
      class: clazz,
      cascade: cascade,
      populate: populate,
    };
    if (joinTableOpts) metadata.joinTable = joinTableOpts;
    if (fk) metadata.name = fk;
    const pkTypes = getPkTypes(clazz);
    const decs = [
      prop(),
      relation(key, metadata),
      list([clazz, ...pkTypes]),
      // onCreate(oneToManyOnCreate, metadata),
      // onUpdate(oneToManyOnUpdate, metadata),
      // onDelete(oneToManyOnDelete, metadata),
      // afterAll(populate, metadata),
    ];
    return apply(...decs);
  }
  return Decoration.for(key)
    .define({
      decorator: manyToManyDec,
      args: [clazz, cascadeOptions, populate, joinTableOpts, fk],
    })
    .apply();
}

export function noValidateOn(...ops: OperationKeys[]) {
  return function noValidateOn(target: any, propertyKey?: any) {
    const currentMeta =
      Metadata.get(
        target,
        Metadata.key(PersistenceKeys.NO_VALIDATE, propertyKey)
      ) || [];
    const newMeta = [...new Set([...currentMeta, ...ops])];
    return newApply(
      newMetadata(
        Metadata.key(PersistenceKeys.NO_VALIDATE, propertyKey),
        newMeta
      )
    )(target, propertyKey);
  };
}

export function noValidateOnCreate() {
  return noValidateOn(OperationKeys.CREATE);
}

export function noValidateOnUpdate() {
  return noValidateOn(OperationKeys.UPDATE);
}

export function noValidateOnCreateUpdate() {
  return noValidateOn(OperationKeys.UPDATE, OperationKeys.CREATE);
}

/**
 * @description Specifies the model property as a relation
 * @summary Decorator that specifies the model property as a relation in the database
 * @return {Function} A decorator function that can be applied to a class property
 * @function relation
 * @category Property Decorators
 */
export function relation(relationKey: string, meta: RelationsMetadata) {
  function relation(relationKey: string, meta: RelationsMetadata) {
    return function relation(obj: any, attr: any) {
      propMetadata(relationKey, meta)(obj, attr);
      return propMetadata(
        Metadata.key(PersistenceKeys.RELATIONS, attr),
        Object.assign({}, meta, {
          key: relationKey,
        })
      )(obj, attr);
    };
  }

  return Decoration.for(PersistenceKeys.RELATIONS)
    .define({
      decorator: relation,
      args: [relationKey, meta],
    })
    .apply();
}
