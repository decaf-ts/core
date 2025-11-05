import {
  Constructor,
  Model,
  ModelConstructor,
  Validation,
  ValidationKeys,
} from "@decaf-ts/decorator-validation";
import { Repo, Repository } from "../repository/Repository";
import { RelationsMetadata } from "./types";
import {
  findPrimaryKey,
  InternalError,
  NotFoundError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Cascade } from "../repository/constants";
import { Context } from "@decaf-ts/db-decorators";

/**
 * @description Creates or updates a model instance
 * @summary Determines whether to create a new model or update an existing one based on the presence of a primary key
 * @template M - The model type extending Model
 * @template F - The repository flags type
 * @param {M} model - The model instance to create or update
 * @param {Context<F>} context - The context for the operation
 * @param {Repo<M, F, Context<F>>} [repository] - Optional repository to use for the operation
 * @return {Promise<M>} A promise that resolves to the created or updated model
 * @function createOrUpdate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant createOrUpdate
 *   participant Repository
 *   participant Model
 *
 *   Caller->>createOrUpdate: model, context, repository?
 *   alt repository not provided
 *     createOrUpdate->>Model: get(model.constructor.name)
 *     Model-->>createOrUpdate: constructor
 *     createOrUpdate->>Repository: forModel(constructor)
 *     Repository-->>createOrUpdate: repository
 *   end
 *
 *   alt primary key undefined
 *     createOrUpdate->>Repository: create(model, context)
 *     Repository-->>createOrUpdate: created model
 *   else primary key defined
 *     createOrUpdate->>Repository: update(model, context)
 *     alt update successful
 *       Repository-->>createOrUpdate: updated model
 *     else NotFoundError
 *       createOrUpdate->>Repository: create(model, context)
 *       Repository-->>createOrUpdate: created model
 *     end
 *   end
 *
 *   createOrUpdate-->>Caller: model
 */
export async function createOrUpdate<
  M extends Model,
  F extends RepositoryFlags,
>(
  model: M,
  context: Context<F>,
  alias?: string,
  repository?: Repo<M, F, Context<F>>
): Promise<M> {
  if (!repository) {
    const constructor = Model.get(model.constructor.name);
    if (!constructor)
      throw new InternalError(`Could not find model ${model.constructor.name}`);
    repository = Repository.forModel<M, Repo<M>>(
      constructor as unknown as ModelConstructor<M>,
      alias
    );
  }
  if (typeof model[repository.pk] === "undefined")
    return repository.create(model, context);
  else {
    try {
      return repository.update(model, context);
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) throw e;
      return repository.create(model, context);
    }
  }
}

/**
 * @description Handles one-to-one relationship creation
 * @summary Processes a one-to-one relationship when creating a model, either by referencing an existing model or creating a new one
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param {string} key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToOneOnCreate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToOneOnCreate
 *   participant repositoryFromTypeMetadata
 *   participant Model
 *   participant Repository
 *   participant cacheModelForPopulate
 *
 *   Caller->>oneToOneOnCreate: this, context, data, key, model
 *   oneToOneOnCreate->>oneToOneOnCreate: check if propertyValue exists
 *
 *   alt propertyValue is not an object
 *     oneToOneOnCreate->>repositoryFromTypeMetadata: model, key
 *     repositoryFromTypeMetadata-->>oneToOneOnCreate: innerRepo
 *     oneToOneOnCreate->>innerRepo: read(propertyValue)
 *     innerRepo-->>oneToOneOnCreate: read
 *     oneToOneOnCreate->>cacheModelForPopulate: context, model, key, propertyValue, read
 *     oneToOneOnCreate->>oneToOneOnCreate: set model[key] = propertyValue
 *   else propertyValue is an object
 *     oneToOneOnCreate->>Model: get(data.class)
 *     Model-->>oneToOneOnCreate: constructor
 *     oneToOneOnCreate->>Repository: forModel(constructor)
 *     Repository-->>oneToOneOnCreate: repo
 *     oneToOneOnCreate->>repo: create(propertyValue)
 *     repo-->>oneToOneOnCreate: created
 *     oneToOneOnCreate->>findPrimaryKey: created
 *     findPrimaryKey-->>oneToOneOnCreate: pk
 *     oneToOneOnCreate->>cacheModelForPopulate: context, model, key, created[pk], created
 *     oneToOneOnCreate->>oneToOneOnCreate: set model[key] = created[pk]
 *   end
 *
 *   oneToOneOnCreate-->>Caller: void
 */
export async function oneToOneOnCreate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const propertyValue: any = model[key];
  if (!propertyValue) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(
      model,
      key,
      this.adapter.alias
    );
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  data.class =
    typeof data.class === "string" ? data.class : (data.class as any)().name;

  const constructor = Model.get(data.class as string);
  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  const repo: Repo<any> = Repository.forModel(constructor, this.adapter.alias);
  const created = await repo.create(propertyValue);
  const pk = findPrimaryKey(created).id;
  await cacheModelForPopulate(context, model, key, created[pk], created);
  (model as any)[key] = created[pk];
}

/**
 * @description Handles one-to-one relationship updates
 * @summary Processes a one-to-one relationship when updating a model, either by referencing an existing model or updating the related model
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToOneOnUpdate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToOneOnUpdate
 *   participant repositoryFromTypeMetadata
 *   participant createOrUpdate
 *   participant findPrimaryKey
 *   participant cacheModelForPopulate
 *
 *   Caller->>oneToOneOnUpdate: this, context, data, key, model
 *   oneToOneOnUpdate->>oneToOneOnUpdate: check if propertyValue exists
 *   oneToOneOnUpdate->>oneToOneOnUpdate: check if cascade.update is CASCADE
 *
 *   alt propertyValue is not an object
 *     oneToOneOnUpdate->>repositoryFromTypeMetadata: model, key
 *     repositoryFromTypeMetadata-->>oneToOneOnUpdate: innerRepo
 *     oneToOneOnUpdate->>innerRepo: read(propertyValue)
 *     innerRepo-->>oneToOneOnUpdate: read
 *     oneToOneOnUpdate->>cacheModelForPopulate: context, model, key, propertyValue, read
 *     oneToOneOnUpdate->>oneToOneOnUpdate: set model[key] = propertyValue
 *   else propertyValue is an object
 *     oneToOneOnUpdate->>createOrUpdate: model[key], context
 *     createOrUpdate-->>oneToOneOnUpdate: updated
 *     oneToOneOnUpdate->>findPrimaryKey: updated
 *     findPrimaryKey-->>oneToOneOnUpdate: pk
 *     oneToOneOnUpdate->>cacheModelForPopulate: context, model, key, updated[pk], updated
 *     oneToOneOnUpdate->>oneToOneOnUpdate: set model[key] = updated[pk]
 *   end
 *
 *   oneToOneOnUpdate-->>Caller: void
 */
export async function oneToOneOnUpdate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const propertyValue: any = model[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(
      model,
      key,
      this.adapter.alias
    );
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  const updated = await createOrUpdate(
    model[key] as M,
    context,
    this.adapter.alias
  );
  const pk = findPrimaryKey(updated).id;
  await cacheModelForPopulate(
    context,
    model,
    key,
    updated[pk] as string,
    updated
  );
  model[key] = updated[pk];
}

/**
 * @description Handles one-to-one relationship deletion
 * @summary Processes a one-to-one relationship when deleting a model, deleting the related model if cascade is enabled
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToOneOnDelete
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToOneOnDelete
 *   participant repositoryFromTypeMetadata
 *   participant cacheModelForPopulate
 *
 *   Caller->>oneToOneOnDelete: this, context, data, key, model
 *   oneToOneOnDelete->>oneToOneOnDelete: check if propertyValue exists
 *   oneToOneOnDelete->>oneToOneOnDelete: check if cascade.update is CASCADE
 *
 *   oneToOneOnDelete->>repositoryFromTypeMetadata: model, key
 *   repositoryFromTypeMetadata-->>oneToOneOnDelete: innerRepo
 *
 *   alt propertyValue is not a Model instance
 *     oneToOneOnDelete->>innerRepo: delete(model[key], context)
 *     innerRepo-->>oneToOneOnDelete: deleted
 *   else propertyValue is a Model instance
 *     oneToOneOnDelete->>innerRepo: delete(model[key][innerRepo.pk], context)
 *     innerRepo-->>oneToOneOnDelete: deleted
 *   end
 *
 *   oneToOneOnDelete->>cacheModelForPopulate: context, model, key, deleted[innerRepo.pk], deleted
 *   oneToOneOnDelete-->>Caller: void
 */
export async function oneToOneOnDelete<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const propertyValue: any = model[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;
  const innerRepo: Repo<M> = repositoryFromTypeMetadata(
    model,
    key,
    this.adapter.alias
  );
  let deleted: M;
  if (!(propertyValue instanceof Model))
    deleted = await innerRepo.delete(model[key] as string);
  else
    deleted = await innerRepo.delete(
      (model[key] as M)[innerRepo.pk as keyof M] as string
    );
  await cacheModelForPopulate(
    context,
    model,
    key,
    deleted[innerRepo.pk] as string,
    deleted
  );
}

/**
 * @description Handles one-to-many relationship creation
 * @summary Processes a one-to-many relationship when creating a model, either by referencing existing models or creating new ones
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToManyOnCreate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToManyOnCreate
 *   participant repositoryFromTypeMetadata
 *   participant createOrUpdate
 *   participant findPrimaryKey
 *   participant cacheModelForPopulate
 *
 *   Caller->>oneToManyOnCreate: this, context, data, key, model
 *   oneToManyOnCreate->>oneToManyOnCreate: check if propertyValues exists and has length
 *   oneToManyOnCreate->>oneToManyOnCreate: check if all elements have same type
 *   oneToManyOnCreate->>oneToManyOnCreate: create uniqueValues set
 *
 *   alt arrayType is not "object"
 *     oneToManyOnCreate->>repositoryFromTypeMetadata: model, key
 *     repositoryFromTypeMetadata-->>oneToManyOnCreate: repo
 *     loop for each id in uniqueValues
 *       oneToManyOnCreate->>repo: read(id)
 *       repo-->>oneToManyOnCreate: read
 *       oneToManyOnCreate->>cacheModelForPopulate: context, model, key, id, read
 *     end
 *     oneToManyOnCreate->>oneToManyOnCreate: set model[key] = [...uniqueValues]
 *   else arrayType is "object"
 *     oneToManyOnCreate->>findPrimaryKey: propertyValues[0]
 *     findPrimaryKey-->>oneToManyOnCreate: pkName
 *     oneToManyOnCreate->>oneToManyOnCreate: create result set
 *     loop for each m in propertyValues
 *       oneToManyOnCreate->>createOrUpdate: m, context
 *       createOrUpdate-->>oneToManyOnCreate: record
 *       oneToManyOnCreate->>cacheModelForPopulate: context, model, key, record[pkName], record
 *       oneToManyOnCreate->>oneToManyOnCreate: add record[pkName] to result
 *     end
 *     oneToManyOnCreate->>oneToManyOnCreate: set model[key] = [...result]
 *   end
 *
 *   oneToManyOnCreate-->>Caller: void
 */
export async function oneToManyOnCreate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const propertyValues: any = model[key];
  if (!propertyValues || !propertyValues.length) return;
  const arrayType = typeof propertyValues[0];
  if (!propertyValues.every((item: any) => typeof item === arrayType))
    throw new InternalError(
      `Invalid operation. All elements of property ${key as string} must match the same type.`
    );
  const uniqueValues = new Set([...propertyValues]);
  if (arrayType !== "object") {
    const repo = repositoryFromTypeMetadata(model, key, this.adapter.alias);
    for (const id of uniqueValues) {
      const read = await repo.read(id);
      await cacheModelForPopulate(context, model, key, id, read);
    }
    (model as any)[key] = [...uniqueValues];
    return;
  }

  const pkName = findPrimaryKey(propertyValues[0]).id;

  const result: Set<string> = new Set();

  for (const m of propertyValues) {
    const record = await createOrUpdate(m, context, this.adapter.alias);
    await cacheModelForPopulate(context, model, key, record[pkName], record);
    result.add(record[pkName]);
  }

  (model as any)[key] = [...result];
}

/**
 * @description Handles one-to-many relationship updates
 * @summary Processes a one-to-many relationship when updating a model, delegating to oneToManyOnCreate if cascade update is enabled
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToManyOnUpdate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToManyOnUpdate
 *   participant oneToManyOnCreate
 *
 *   Caller->>oneToManyOnUpdate: this, context, data, key, model
 *   oneToManyOnUpdate->>oneToManyOnUpdate: check if cascade.update is CASCADE
 *
 *   alt cascade.update is CASCADE
 *     oneToManyOnUpdate->>oneToManyOnCreate: apply(this, [context, data, key, model])
 *     oneToManyOnCreate-->>oneToManyOnUpdate: void
 *   end
 *
 *   oneToManyOnUpdate-->>Caller: void
 */
export async function oneToManyOnUpdate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return oneToManyOnCreate.apply(this as any, [
    context,
    data,
    key as keyof Model,
    model,
  ]);
}

/**
 * @description Handles one-to-many relationship deletion
 * @summary Processes a one-to-many relationship when deleting a model, deleting all related models if cascade delete is enabled
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function oneToManyOnDelete
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant oneToManyOnDelete
 *   participant Repository
 *   participant repositoryFromTypeMetadata
 *   participant cacheModelForPopulate
 *
 *   Caller->>oneToManyOnDelete: this, context, data, key, model
 *   oneToManyOnDelete->>oneToManyOnDelete: check if cascade.delete is CASCADE
 *   oneToManyOnDelete->>oneToManyOnDelete: check if values exists and has length
 *   oneToManyOnDelete->>oneToManyOnDelete: check if all elements have same type
 *
 *   alt isInstantiated (arrayType is "object")
 *     oneToManyOnDelete->>Repository: forModel(values[0])
 *     Repository-->>oneToManyOnDelete: repo
 *   else not instantiated
 *     oneToManyOnDelete->>repositoryFromTypeMetadata: model, key
 *     repositoryFromTypeMetadata-->>oneToManyOnDelete: repo
 *   end
 *
 *   oneToManyOnDelete->>oneToManyOnDelete: create uniqueValues set
 *
 *   loop for each id in uniqueValues
 *     oneToManyOnDelete->>repo: delete(id, context)
 *     repo-->>oneToManyOnDelete: deleted
 *     oneToManyOnDelete->>cacheModelForPopulate: context, model, key, id, deleted
 *   end
 *
 *   oneToManyOnDelete->>oneToManyOnDelete: set model[key] = [...uniqueValues]
 *   oneToManyOnDelete-->>Caller: void
 */
export async function oneToManyOnDelete<
  M extends Model,
  R extends Repo<M, F, C>,
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
  if (data.cascade.delete !== Cascade.CASCADE) return;
  const values = model[key] as any;
  if (!values || !values.length) return;
  const arrayType = typeof values[0];
  const areAllSameType = values.every((item: any) => typeof item === arrayType);
  if (!areAllSameType)
    throw new InternalError(
      `Invalid operation. All elements of property ${key as string} must match the same type.`
    );
  const isInstantiated = arrayType === "object";
  const repo = isInstantiated
    ? Repository.forModel(values[0], this.adapter.alias)
    : repositoryFromTypeMetadata(model, key, this.adapter.alias);

  const uniqueValues = new Set([
    ...(isInstantiated
      ? values.map((v: Record<string, any>) => v[repo.pk as string])
      : values),
  ]);

  for (const id of uniqueValues.values()) {
    const deleted = await repo.delete(id);
    await cacheModelForPopulate(context, model, key, id, deleted);
  }
  (model as any)[key] = [...uniqueValues];
}

/**
 * @description Generates a key for caching populated model relationships
 * @summary Creates a unique key for storing and retrieving populated model relationships in the cache
 * @param {string} tableName - The name of the table or model
 * @param {string} fieldName - The name of the field or property
 * @param {string|number} id - The identifier of the related model
 * @return {string} A dot-separated string that uniquely identifies the relationship
 * @function getPopulateKey
 * @memberOf module:core
 */
export function getPopulateKey(
  tableName: string,
  fieldName: string,
  id: string | number
) {
  return [PersistenceKeys.POPULATE, tableName, fieldName, id].join(".");
}

/**
 * @description Caches a model for later population
 * @summary Stores a model in the context cache for efficient retrieval during relationship population
 * @template M - The model type extending Model
 * @template F - The repository flags type
 * @param {Context<F>} context - The context for the operation
 * @param {M} parentModel - The parent model that contains the relationship
 * @param propertyKey - The property key of the relationship
 * @param {string | number} pkValue - The primary key value of the related model
 * @param {any} cacheValue - The model instance to cache
 * @return {Promise<any>} A promise that resolves with the result of the cache operation
 * @function cacheModelForPopulate
 * @memberOf module:core
 */
export async function cacheModelForPopulate<
  M extends Model,
  F extends RepositoryFlags,
>(
  context: Context<F>,
  parentModel: M,
  propertyKey: keyof M | string,
  pkValue: string | number,
  cacheValue: any
) {
  const cacheKey = getPopulateKey(
    parentModel.constructor.name,
    propertyKey as string,
    pkValue
  );
  return context.accumulate({ [cacheKey]: cacheValue });
}

/**
 * @description Populates a model's relationship
 * @summary Retrieves and attaches related models to a model's relationship property
 * @template M - The model type extending Model
 * @template R - The repository type extending Repo<M, F, C>
 * @template V - The relations metadata type extending RelationsMetadata
 * @template F - The repository flags type
 * @template C - The context type extending Context<F>
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The context for the operation
 * @param {V} data - The relations metadata
 * @param key - The property key of the relationship
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the operation is complete
 * @function populate
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant populate
 *   participant fetchPopulateValues
 *   participant getPopulateKey
 *   participant Context
 *   participant repositoryFromTypeMetadata
 *
 *   Caller->>populate: this, context, data, key, model
 *   populate->>populate: check if data.populate is true
 *   populate->>populate: get nested value and check if it exists
 *
 *   populate->>fetchPopulateValues: context, model, key, isArr ? nested : [nested]
 *
 *   fetchPopulateValues->>fetchPopulateValues: initialize variables
 *
 *   loop for each proKeyValue in propKeyValues
 *     fetchPopulateValues->>getPopulateKey: model.constructor.name, propName, proKeyValue
 *     getPopulateKey-->>fetchPopulateValues: cacheKey
 *
 *     alt try to get from cache
 *       fetchPopulateValues->>Context: get(cacheKey)
 *       Context-->>fetchPopulateValues: val
 *     else catch error
 *       fetchPopulateValues->>repositoryFromTypeMetadata: model, propName
 *       repositoryFromTypeMetadata-->>fetchPopulateValues: repo
 *       fetchPopulateValues->>repo: read(proKeyValue)
 *       repo-->>fetchPopulateValues: val
 *     end
 *
 *     fetchPopulateValues->>fetchPopulateValues: add val to results
 *   end
 *
 *   fetchPopulateValues-->>populate: results
 *   populate->>populate: set model[key] = isArr ? res : res[0]
 *   populate-->>Caller: void
 */
export async function populate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  if (!data.populate) return;
  const nested: any = model[key];
  const isArr = Array.isArray(nested);
  if (typeof nested === "undefined" || (isArr && nested.length === 0)) return;

  async function fetchPopulateValues(
    c: Context<F>,
    model: M,
    propName: string,
    propKeyValues: any[],
    alias?: string
  ) {
    let cacheKey: string;
    let val: any;
    const results: M[] = [];
    for (const proKeyValue of propKeyValues) {
      cacheKey = getPopulateKey(model.constructor.name, propName, proKeyValue);
      try {
        val = await c.get(cacheKey as any);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: any) {
        const repo = repositoryFromTypeMetadata(model, propName, alias);
        if (!repo) throw new InternalError("Could not find repo");
        val = await repo.read(proKeyValue);
      }
      results.push(val);
    }
    return results;
  }
  const res = await fetchPopulateValues(
    context,
    model,
    key as string,
    isArr ? nested : [nested],
    this.adapter.alias
  );
  (model as any)[key] = isArr ? res : res[0];
}

/**
 * @description List of common JavaScript types
 * @summary An array of strings representing common JavaScript types that are not custom model types
 * @const commomTypes
 * @memberOf module:core
 */
const commomTypes = [
  "array",
  "string",
  "number",
  "boolean",
  "symbol",
  "function",
  "object",
  "undefined",
  "null",
  "bigint",
];

/**
 * @description Retrieves a repository for a model property based on its type metadata
 * @summary Examines a model property's type metadata to determine the appropriate repository for related models
 * @template M - The model type extending Model
 * @param {any} model - The model instance containing the property
 * @param propertyKey - The property key to examine
 * @return {Repo<M>} A repository for the model type associated with the property
 * @function repositoryFromTypeMetadata
 * @memberOf module:core
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant repositoryFromTypeMetadata
 *   participant Reflect
 *   participant Validation
 *   participant Model
 *   participant Repository
 *
 *   Caller->>repositoryFromTypeMetadata: model, propertyKey
 *
 *   repositoryFromTypeMetadata->>Validation: key(Array.isArray(model[propertyKey]) ? ValidationKeys.LIST : ValidationKeys.TYPE)
 *   Validation-->>repositoryFromTypeMetadata: validationKey
 *
 *   repositoryFromTypeMetadata->>Reflect: getMetadata(validationKey, model, propertyKey)
 *   Reflect-->>repositoryFromTypeMetadata: types
 *
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: determine customTypes based on property type
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: check if types and customTypes exist
 *
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: create allowedTypes array
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: find constructorName not in commomTypes
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: check if constructorName exists
 *
 *   repositoryFromTypeMetadata->>Model: get(constructorName)
 *   Model-->>repositoryFromTypeMetadata: constructor
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: check if constructor exists
 *
 *   repositoryFromTypeMetadata->>Repository: forModel(constructor)
 *   Repository-->>repositoryFromTypeMetadata: repo
 *
 *   repositoryFromTypeMetadata-->>Caller: repo
 */
export function repositoryFromTypeMetadata<M extends Model>(
  model: any,
  propertyKey: string | keyof M,
  alias?: string
): Repo<M> {
  const types = Reflect.getMetadata(
    Validation.key(
      Array.isArray(model[propertyKey])
        ? ValidationKeys.LIST
        : ValidationKeys.TYPE
    ),
    model,
    propertyKey as string
  );
  const customTypes: any = Array.isArray(model[propertyKey])
    ? types.clazz
    : types.customTypes;
  if (!types || !customTypes)
    throw new InternalError(
      `Failed to find types decorators for property ${propertyKey as string}`
    );

  const allowedTypes: string[] = (
    Array.isArray(customTypes) ? [...customTypes] : [customTypes]
  ).map((t) => (typeof t === "function" ? t() : t));
  const constructorName = allowedTypes.find(
    (t) => !commomTypes.includes(`${t}`.toLowerCase())
  );
  if (!constructorName)
    throw new InternalError(
      `Property key ${propertyKey as string} does not have a valid constructor type`
    );
  const constructor: Constructor<M> | undefined = Model.get(constructorName);
  if (!constructor)
    throw new InternalError(`No registered model found for ${constructorName}`);

  return Repository.forModel(constructor, alias) as any;
}
