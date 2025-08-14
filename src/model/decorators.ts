import {
  ConflictError,
  onCreate,
  onCreateUpdate,
  onDelete,
  onUpdate,
  afterAny,
  RepositoryFlags,
  Context,
} from "@decaf-ts/db-decorators";
import { apply, metadata } from "@decaf-ts/reflection";
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
import { AuthorizationError } from "../utils";

/**
 * @description Specifies the database table name for a model
 * @summary Decorator that sets the table name for a model class in the database
 * @param {string} opts - The name of the table in the database
 * @return {Function} A decorator function that can be applied to a class
 * @function table
 * @category Class Decorators
 */
export function table<OPTS = string>(opts: OPTS) {
  const key = Adapter.key(PersistenceKeys.TABLE);
  return Decoration.for(key)
    .define({
      decorator: metadata,
      args: [key, opts],
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
  const key = Adapter.key(PersistenceKeys.COLUMN);
  return Decoration.for(key)
    .define({
      decorator: function column(k, c) {
        return function column(obj: any, attr: any) {
          return propMetadata(k, c || attr)(obj, attr);
        };
      },
      args: [key, columnName],
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
export function index(directions?: OrderDirection[], compositions?: string[]) {
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
export async function uniqueOnCreateUpdate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const key = Repository.key(PersistenceKeys.UNIQUE);
  return Decoration.for(key)
    .define(onCreateUpdate(uniqueOnCreateUpdate), propMetadata(key, {}))
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
  R extends Repo<M, F, C>,
  V extends RelationsMetadata,
  F extends RepositoryFlags,
  C extends Context<F>,
>(
  this: R,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: Context<F>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  data: V,
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
  const key = Repository.key(PersistenceKeys.CREATED_BY);
  return Decoration.for(key)
    .define(onCreate(createdByOnCreateUpdate), propMetadata(key, {}))
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
  const key = Repository.key(PersistenceKeys.UPDATED_BY);
  return Decoration.for(key)
    .define(onCreateUpdate(createdByOnCreateUpdate), propMetadata(key, {}))
    .apply();
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
  populate: boolean = true
) {
  if (!clazz.name) clazz = (clazz as () => Constructor<M>)() as Constructor<M>;
  Model.register(clazz as Constructor<M>);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  const key = Repository.key(PersistenceKeys.ONE_TO_ONE);

  function oneToOneDec(clazz: Constructor<any>, meta: RelationsMetadata) {
    return apply(
      prop(PersistenceKeys.RELATIONS),
      type([clazz.name, String.name, Number.name, BigInt.name]),
      onCreate(oneToOneOnCreate, meta),
      onUpdate(oneToOneOnUpdate, meta),
      onDelete(oneToOneOnDelete, meta),
      afterAny(pop, meta),
      propMetadata(key, meta)
    );
  }

  return Decoration.for(key)
    .define({
      decorator: oneToOneDec,
      args: [clazz, metadata],
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
  populate: boolean = true
) {
  if (!clazz.name) clazz = (clazz as () => Constructor<M>)() as Constructor<M>;
  Model.register(clazz as Constructor<M>);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  const key = Repository.key(PersistenceKeys.ONE_TO_MANY);

  function oneToManyDec(clazz: Constructor<any>, metadata: RelationsMetadata) {
    return apply(
      prop(PersistenceKeys.RELATIONS),
      list([
        clazz,
        String,
        Number,
        // @ts-expect-error Bigint is not a constructor
        BigInt,
      ]),
      onCreate(oneToManyOnCreate, metadata),
      onUpdate(oneToManyOnUpdate, metadata),
      onDelete(oneToManyOnDelete, metadata),
      afterAny(pop, metadata),
      propMetadata(key, metadata)
    );
  }

  return Decoration.for(key)
    .define({
      decorator: oneToManyDec,
      args: [clazz, metadata],
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
  populate = true
) {
  if (!clazz.name) clazz = (clazz as () => Constructor<M>)() as Constructor<M>;
  Model.register(clazz as Constructor<M>);
  const metadata: RelationsMetadata = {
    class: clazz.name,
    cascade: cascadeOptions,
    populate: populate,
  };
  const key = Repository.key(PersistenceKeys.MANY_TO_ONE);

  function manyToOneDec(clazz: Constructor<any>, metadata: RelationsMetadata) {
    return apply(
      prop(PersistenceKeys.RELATIONS),
      type([clazz.name, String.name, Number.name, BigInt.name]),
      // onCreate(oneToManyOnCreate, metadata),
      // onUpdate(oneToManyOnUpdate, metadata),
      // onDelete(oneToManyOnDelete, metadata),
      // afterAny(pop, metadata),
      propMetadata(key, metadata)
    );
  }

  return Decoration.for(key)
    .define({
      decorator: manyToOneDec,
      args: [clazz, metadata],
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
  populate = true
) {
  if (!clazz.name) clazz = (clazz as () => Constructor<M>)() as Constructor<M>;
  Model.register(clazz as Constructor<M>);
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
      propMetadata(key, metadata)
    )
    .apply();
}
