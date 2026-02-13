import {
  model,
  isEqual,
  Model,
  type ModelArg,
  ModelConstructor,
  required,
  ValidationKeys,
} from "@decaf-ts/decorator-validation";
import { Repo, Repository } from "../repository/Repository";
import { RelationsMetadata } from "./types";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Cascade } from "../repository/constants";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { AdapterFlags, ContextOf } from "../persistence/types";
import { Context } from "../persistence/Context";
import { Sequence } from "../persistence/Sequence";
import { pk } from "../identity/decorators";

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
export async function createOrUpdate<M extends Model, F extends AdapterFlags>(
  model: M,
  context: Context<F>,
  alias: string,
  repository?: Repo<M>,
  overrides?: Record<string, any>
): Promise<M> {
  const log = context.logger.for(createOrUpdate);
  if (!repository) {
    const constructor = Model.get(model.constructor.name);
    if (!constructor)
      throw new InternalError(`Could not find model ${model.constructor.name}`);
    repository = Repository.forModel<M, Repo<M>>(
      constructor as unknown as ModelConstructor<M>,
      alias
    );
    log.info(`Retrieved ${repository.toString()}`);
  }

  repository = overrides ? repository.override(overrides) : repository;

  let result: M;

  if (typeof model[Model.pk(repository.class)] === "undefined") {
    log.info(`No pk found in ${Model.tableName(repository.class)} - creating`);
    result = await repository.create(model, context);
  } else {
    log.info(
      `pk found in ${Model.tableName(repository.class)} - attempting update`
    );
    try {
      result = await repository.update(model, context);
      log.info(`Updated ${Model.tableName(repository.class)}`);
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
      log.info(
        `update Failed - creating new ${Model.tableName(repository.class)}`
      );
      result = await repository.create(model, context);
    }

    log.info(`After create update: ${result}`);
  }
  return result;
}
//
// export async function createOrUpdateBulk<
//   M extends Model,
//   F extends AdapterFlags,
// >(
//   models: M[],
//   context: Context<F>,
//   alias: string,
//   repository?: Repo<M>
// ): Promise<M> {
//   const log = context.logger.for(createOrUpdateBulk);
//   if (!repository) {
//     const constructor = Model.get(models[0].constructor.name);
//     if (!constructor)
//       throw new InternalError(
//         `Could not find model ${models[0].constructor.name}`
//       );
//     repository = Repository.forModel<M, Repo<M>>(
//       constructor as unknown as ModelConstructor<M>,
//       alias
//     );
//     log.info(`Retrieved ${repository.toString()}`);
//   }
//   const pks = models.map((m) => m[Model.pk(m)]);
//
//   const existing = await Promise.allSettled(pks.map((pk) => repository.read(pk as string, context)));
//
//   existing.forEach((ex, i) => {
//     if (ex.status === "fulfilled") {
//
//     }
//   })
//
//   for (let ex of existing){
//     if (ex.)
//   }
//   let result: M;
//
//   if (typeof model[Model.pk(repository.class)] === "undefined") {
//     log.info(`No pk found in ${Model.tableName(repository.class)} - creating`);
//     result = await repository.create(model, context);
//   } else {
//     log.info(
//       `pk found in ${Model.tableName(repository.class)} - attempting update`
//     );
//     try {
//       result = await repository.update(model, context);
//       log.info(`Updated ${Model.tableName(repository.class)}`);
//     } catch (e: any) {
//       if (!(e instanceof NotFoundError)) {
//         throw e;
//       }
//       log.info(
//         `update Failed - creating new ${Model.tableName(repository.class)}`
//       );
//       result = await repository.create(model, context);
//     }
//
//     log.info(`After create update: ${result}`);
//   }
//   return result;
// }

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
export async function oneToOneOnCreate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const propertyValue: any = model[key];
  if (!propertyValue) return;
  if (!validBidirectionalRelation(model, data)) return;
  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(
      model,
      key,
      this.adapter.alias
    );
    const read = await innerRepo.read(propertyValue, context);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }
  const constructor: Constructor = (
    typeof data.class === "function" && !data.class.name
      ? (data.class as () => Constructor)()
      : data.class
  ) as Constructor;

  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  const repo: Repo<any> = Repository.forModel(constructor, this.adapter.alias);
  const created = await repo
    .override(this._overrides)
    .create(propertyValue, context);
  const pk = Model.pk(created);
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
export async function oneToOneOnUpdate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
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
    const read = await innerRepo
      .override(this._overrides)
      .read(propertyValue, context);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  const updated = await createOrUpdate(
    model[key] as M,
    context,
    this.adapter.alias,
    undefined,
    this._overrides
  );
  const pk = Model.pk(updated);
  await cacheModelForPopulate(
    context,
    model,
    key,
    updated[pk as keyof M] as string,
    updated
  );
  model[key] = updated[pk as keyof M];
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
export async function oneToOneOnDelete<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
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
    deleted = await innerRepo.delete(model[key] as string, context);
  else
    deleted = await innerRepo.delete(
      (model[key] as M)[innerRepo.pk as keyof M] as string,
      context
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
export async function oneToManyOnCreateUpdate<
  M extends Model,
  R extends Repo<M>,
>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  oldModel?: M
): Promise<void> {
  const propertyValues: any = model[key];
  if (!propertyValues || !propertyValues.length) return;

  if (!validBidirectionalRelation(model, data)) return;

  const arrayType = typeof propertyValues[0];
  if (!propertyValues.every((item: any) => typeof item === arrayType))
    throw new InternalError(
      `Invalid operation. All elements of property ${key as string} must match the same type.`
    );
  const log = context.logger.for(oneToManyOnCreateUpdate);
  const uniqueValues = new Set([...propertyValues]);
  if (arrayType !== "object") {
    const repo = repositoryFromTypeMetadata(model, key, this.adapter.alias);
    const read = await repo
      .override(this._overrides)
      .readAll([...uniqueValues.values()], context);
    for (let i = 0; i < read.length; i++) {
      const model = read[i];
      log.info(`FOUND ONE TO MANY VALUE: ${JSON.stringify(model)}`);
      await cacheModelForPopulate(
        context,
        model,
        key,
        [...uniqueValues.values()][i],
        read
      );
    }
    // for (const model of read) {
    //   // const read = await repo.read(id, context);
    //
    // }
    (model as any)[key] = [...uniqueValues];
    log.info(`SET ONE TO MANY IDS: ${(model as any)[key]}`);
    return;
  }

  const pkName = Model.pk(propertyValues[0].constructor);

  const result: Set<string> = new Set();

  for (const m of propertyValues) {
    log.info(`Creating or updating one-to-many model: ${JSON.stringify(m)}`);
    const record = await createOrUpdate(
      m,
      context,
      this.adapter.alias,
      undefined,
      this._overrides
    );
    log.info(`caching: ${JSON.stringify(record)} under ${record[pkName]}`);
    await cacheModelForPopulate(context, model, key, record[pkName], record);
    log.info(`Creating or updating one-to-many model: ${JSON.stringify(m)}`);
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
export async function oneToManyOnUpdate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M,
  oldModel?: M
): Promise<void> {
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return oneToManyOnCreateUpdate.apply(this as any, [
    context,
    data,
    key as keyof Model,
    model,
    oldModel,
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
export async function oneToManyOnDelete<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
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
  const clazz =
    typeof data.class === "function" && !data.class.name
      ? (data.class as any)()
      : data.class;

  const isInstantiated = arrayType === "object";
  const repo = isInstantiated
    ? Repository.forModel(clazz, this.adapter.alias)
    : repositoryFromTypeMetadata(model, key, this.adapter.alias);

  const uniqueValues = new Set([
    ...(isInstantiated
      ? values.map((v: Record<string, any>) => v[repo["pk"] as string])
      : values),
  ]);

  const ids = [...uniqueValues.values()];
  let deleted: Model[];
  try {
    deleted = await repo.override(this._overrides).deleteAll(ids, context);
  } catch (e: unknown) {
    context.logger.error(`Failed to delete all records`, e);
    throw e;
  }

  let del: any;
  for (let i = 0; i < deleted.length; i++) {
    del = deleted[i];
    try {
      await cacheModelForPopulate(context, model, key, ids[i], del);
    } catch (e: unknown) {
      context.logger.error(
        `Failed to cache record ${ids[i]} with key ${key as string} and model ${JSON.stringify(model, undefined, 2)} `,
        e
      );
      throw e;
    }
  }
  (model as any)[key] = ids;
}

export async function manyToOneOnCreate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const propertyValue: any = model[key];
  if (!propertyValue) return;

  if (!validBidirectionalRelation(model, data)) return;
  const log = context.logger.for(manyToOneOnCreate);
  // If it's a primitive value (ID), read the existing record
  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(
      model,
      key,
      this.adapter.alias
    );
    const read = await innerRepo.override(this._overrides).read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  const constructor =
    data.class instanceof Model ? data.class.constructor : (data.class as any);
  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  log.info(
    `Creating or updating many-to-one model: ${JSON.stringify(propertyValue)}`
  );
  const record = await createOrUpdate(
    propertyValue,
    context,
    this.adapter.alias,
    undefined,
    this._overrides
  );
  const pk = Model.pk(record);

  log.info(`caching: ${JSON.stringify(record)} under ${record[pk]}`);
  await cacheModelForPopulate(
    context,
    model,
    key,
    record[pk] as string,
    record
  );
  (model as any)[key] = record[pk];
}

export function validBidirectionalRelation<M extends Model>(
  model: M,
  data: RelationsMetadata
): boolean {
  let metaReverseRelation: any;
  const relationConstructor =
    typeof data.class === "function" && data.class.name
      ? data.class
      : (data.class as any)();

  // get the inverse relation metadata
  const metaReverseRelationMeta = Metadata.get(
    relationConstructor,
    PersistenceKeys.RELATIONS
  );

  if (metaReverseRelationMeta)
    metaReverseRelation = Object.values(metaReverseRelationMeta)?.find(
      (rel: any) => {
        const relationConstructor =
          typeof rel.class === "function" && rel.class.name
            ? rel.class
            : (rel.class as any)();
        return model instanceof relationConstructor;
      }
    );

  // If populate is set to true on both sides, we should throw an error.
  if (metaReverseRelation?.populate === true && data?.populate === true) {
    throw new InternalError(
      "Bidirectional populate is not allowed. Please set populate to false on one side of the relation."
    );
  }
  return true;
}

export async function manyToOneOnUpdate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return manyToOneOnCreate.apply(this as any, [
    context,
    data,
    key as keyof Model,
    model,
  ]);
}

export async function manyToOneOnDelete<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  if (data.cascade.delete !== Cascade.CASCADE) return;
  const value = model[key] as any;
  if (!value) return;
  const isInstantiated = typeof value === "object";
  const repo = isInstantiated
    ? Repository.forModel(value, this.adapter.alias)
    : repositoryFromTypeMetadata(model, key, this.adapter.alias);

  const repoId = isInstantiated ? value[repo["pk"] as string] : value;

  const deleted = await repo.override(this._overrides).delete(repoId);
  await cacheModelForPopulate(context, model, key, repoId, deleted);

  (model as any)[key] = repoId;
}

export async function manyToManyOnCreate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  modelA: M
): Promise<void> {
  console.warn("DECORATOR manyToMany UNDER DEVELOPMENT");
  const propertyValues: any = modelA[key];
  if (!propertyValues || !propertyValues.length) return;
  if (!validBidirectionalRelation(modelA, data)) return;

  const arrayType = typeof propertyValues[0];
  if (!propertyValues.every((item: any) => typeof item === arrayType))
    throw new InternalError(
      `Invalid operation. All elements of property ${key as string} must match the same type.`
    );
  const log = context.logger.for(manyToManyOnCreate);
  const uniqueValues = new Set([...propertyValues]);
  // If it's a primitive value (ID), read the existing record
  if (arrayType !== "object") {
    const repo = repositoryFromTypeMetadata(modelA, key, this.adapter.alias);
    const read = await repo
      .override(this._overrides)
      .readAll([...uniqueValues.values()], context);
    for (let i = 0; i < read.length; i++) {
      const model = read[i];
      log.info(`FOUND MANY TO MANY VALUE: ${JSON.stringify(model)}`);
      await cacheModelForPopulate(
        context,
        model,
        key,
        [...uniqueValues.values()][i],
        read
      );
    }
    // Create junction table entries
    await getOrCreateJunctionModel.apply(this as Repo<Model>, [
      modelA,
      [...propertyValues] as any[],
      log,
      context,
      data,
    ]);

    (modelA as any)[key] = [...uniqueValues];
    log.info(`SET MANY TO MANY IDS: ${(modelA as any)[key]}`);
    return;
  }

  const pkName = Model.pk(propertyValues[0].constructor);
  const result: Set<string> = new Set();
  for (const propertyValue of propertyValues) {
    log.info(
      `Creating or updating many-to-many model: ${JSON.stringify(propertyValue)}`
    );
    const record = await createOrUpdate(
      propertyValue,
      context,
      this.adapter.alias,
      undefined,
      this._overrides
    );
    log.info(`caching: ${JSON.stringify(record)} under ${record[pkName]}`);
    await cacheModelForPopulate(context, modelA, key, record[pkName], record);
    log.info(
      `Creating or updating many-to-many model: ${JSON.stringify(propertyValue)}`
    );
    propertyValue.id = record.id;
    result.add(record[pkName]);
  }

  // Get or generate the ID for modelA before persisting junction records
  const modelPkName = Model.pk(modelA.constructor as ModelConstructor<M>);
  if (typeof modelA[modelPkName] === "undefined") {
    const nextId = await getNextId(this, modelA, context);
    (modelA as any)[modelPkName] = nextId;
  }

  // Create junction table entries
  const JunctionModel = await getOrCreateJunctionModel.apply(
    this as Repo<Model>,
    [modelA, propertyValues as Model[], log, context, data]
  );

  // This will require creating junction repository and storing the relationships
  log.info(`Junction model created: ${JunctionModel.name}`);

  (modelA as any)[key] = [...result];
}

async function getNextId<M extends Model, R extends Repo<M>>(
  repo: R,
  modelA: M,
  context: ContextOf<R>
): Promise<string | number | bigint> {
  // Get the next id for the model before it is persisted so we can put it in the junction table
  const modelPkName = Model.pk(modelA.constructor as ModelConstructor<M>);

  const modelAId: any = modelA[modelPkName];
  if (modelAId !== undefined) {
    return modelAId;
  }

  const pkProps = Model.sequenceFor(modelA.constructor as ModelConstructor<M>);
  if (!pkProps?.name) {
    pkProps.name = Model.sequenceName(modelA, "pk");
  }
  let sequence: Sequence;
  try {
    // Access adapter through the public property 'db' or use type assertion
    sequence = await (repo as any).adapter.Sequence(pkProps);
    return await sequence.next(context);
  } catch (e: any) {
    throw new InternalError(
      `Failed to instantiate Sequence ${pkProps.name}: ${e}`
    );
  }
}

async function getOrCreateJunctionModel<M extends Model, R extends Repo<M>>(
  this: R,
  modelA: Model,
  modelsB: Model[] | any[],
  log: any,
  context: ContextOf<R>,
  metadata?: RelationsMetadata
): Promise<Constructor<Model<false>>> {
  const { JunctionModel, fkA, fkB } = getAndConstructJunctionTable(
    modelA,
    modelsB[0],
    metadata
  );

  const recordIds: any[] = [];
  for (const modelB of modelsB) {
    log.info(
      `Creating or updating many-to-many junction model: ${JSON.stringify(modelB)}`
    );
    // If it is a model, find and store fk content, else it is fk value directly
    const junctionRegister = {
      [fkA]:
        modelA instanceof Model
          ? modelA[
              Model.pk(modelA.constructor as Constructor) as keyof typeof modelA
            ]
          : modelA,
      [fkB]:
        modelB instanceof Model
          ? modelB[
              Model.pk(modelB.constructor as Constructor) as keyof typeof modelB
            ]
          : modelB,
    };
    const record: any = await createOrUpdate(
      new JunctionModel(junctionRegister),
      context,
      this.adapter.alias,
      undefined,
      this._overrides
    );
    if (record?.id) recordIds.push(record.id);
  }

  if (recordIds.length === modelsB?.length) {
    console.log(
      `All junction records created successfully for table ${JunctionModel?.name}`
    );
    const repository = Repository.forModel<M, Repo<M>>(
      JunctionModel as unknown as ModelConstructor<M>
    );
    const results = await repository
      ?.override(this._overrides)
      .readAll(recordIds);
    console.log("results:", results);
  } else
    console.error(
      `Some junction records failed to be created for table ${JunctionModel?.name}`
    );

  return JunctionModel;
}

export function getAndConstructJunctionTable(
  modelA: Model,
  modelB: Model | any,
  metadata?: RelationsMetadata
): { fkA: string; fkB: string; JunctionModel: Constructor<Model<false>> } {
  // Get the name of the table and fks
  const modelAName = Model.tableName(modelA);
  let modelBName;
  if (modelB instanceof Model) modelBName = Model.tableName(modelB);
  else if (
    Model.isModel(modelB as Record<string, any>) &&
    typeof modelB === "function"
  ) {
    modelBName = modelB.name ? modelB.name : (modelB as any)()?.name;
  } else if (metadata?.class) {
    const clazz =
      typeof metadata.class === "function" && !metadata.class.name
        ? (metadata.class as any)()
        : metadata.class;
    modelBName = Model.tableName(clazz);
  }
  if (!modelAName || !modelBName)
    throw new InternalError("Missing tablenames to create junction table");

  const junctionTableName = metadata?.joinTable?.name
    ? metadata?.joinTable?.name
    : `${modelAName}_${modelBName}`;
  const fkA = `${modelAName?.toLowerCase()}_fk`;
  const fkB = `${modelBName?.toLowerCase()}_fk`;

  // Anonymous class to be able to change name
  const DynamicJunctionModel = class extends Model {
    id!: number;
    [fkA]!: number;
    [fkB]!: number;
    constructor(arg?: ModelArg<any>) {
      super(arg);
    }
  };

  Object.defineProperty(DynamicJunctionModel, "name", {
    value: junctionTableName,
    writable: false,
  });

  // Apply the decorators
  pk({ type: Number })(DynamicJunctionModel.prototype, "id");
  required()(DynamicJunctionModel.prototype, fkA as any);
  required()(DynamicJunctionModel.prototype, fkB as any);

  // Apply @model() decorator to the class
  const DecoratedModel = model()(DynamicJunctionModel);

  Metadata.set(DynamicJunctionModel, PersistenceKeys.TABLE, junctionTableName);
  return {
    fkA,
    fkB,
    JunctionModel: DecoratedModel as Constructor<Model<false>>,
  };
}

export async function manyToManyOnUpdate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  console.warn("method not yet implemented");
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return manyToManyOnCreate.apply(this as any, [
    context,
    data,
    key as keyof Model,
    model,
  ]);
}

export async function manyToManyOnDelete<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  console.warn("Method under development");
  if (data.cascade.delete !== Cascade.CASCADE) return;
  const values = model[key] as any;
  if (!values || !values.length) return;
  const arrayType = typeof values[0];
  const areAllSameType = values.every((item: any) => typeof item === arrayType);
  if (!areAllSameType)
    throw new InternalError(
      `Invalid operation. All elements of property ${key as string} must match the same type.`
    );

  // Delete the values and the junction table entries
  const clazz =
    typeof data.class === "function" && !data.class.name
      ? (data.class as any)()
      : data.class;

  const isInstantiated = arrayType === "object";
  const repo = isInstantiated
    ? Repository.forModel(clazz, this.adapter.alias)
    : repositoryFromTypeMetadata(model, key, this.adapter.alias);

  const uniqueValues = new Set([
    ...(isInstantiated
      ? values.map((v: Record<string, any>) => v[repo["pk"] as string])
      : values),
  ]);

  const ids = [...uniqueValues.values()];
  let deleted: Model[];
  try {
    deleted = await repo.override(this._overrides).deleteAll(ids, context);
  } catch (e: unknown) {
    context.logger.error(`Failed to delete all records`, e);
    throw e;
  }

  let del: any;
  for (let i = 0; i < deleted.length; i++) {
    del = deleted[i];
    try {
      await cacheModelForPopulate(context, model, key, ids[i], del);
    } catch (e: unknown) {
      context.logger.error(
        `Failed to cache record ${ids[i]} with key ${key as string} and model ${JSON.stringify(model, undefined, 2)} `,
        e
      );
      throw e;
    }
  }
  (model as any)[key] = ids;
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
export function getTagForDeleteKey(
  tableName: string,
  fieldName: string,
  id: string | number
) {
  return [PersistenceKeys.TAG_FOR_DELETION, tableName, id].join(".");
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
  F extends AdapterFlags,
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
  const cache = context.get("cacheForPopulate") || {};
  (cache[cacheKey] as Record<string, any>) = cacheValue;
  return context.accumulate({ cacheForPopulate: cache } as any);
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
export async function populate<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  if (!data.populate) return;
  const nested: any = model[key];
  const isArr = Array.isArray(nested);
  if (typeof nested === "undefined" || (isArr && nested.length === 0)) return;

  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const self = this;

  async function fetchPopulateValues(
    c: ContextOf<R>,
    model: M,
    propName: string,
    propKeyValues: any[]
  ) {
    let cacheKey: string;
    let val: any;
    const results: M[] = [];
    const cache = c.get("cacheForPopulate") || {};
    for (const proKeyValue of propKeyValues) {
      cacheKey = getPopulateKey(model.constructor.name, propName, proKeyValue);
      try {
        val = cache[cacheKey];
        if (!val) throw new Error("Not found in cache");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: any) {
        const repo = repositoryFromTypeMetadata(model, propName as keyof M);
        if (!repo) throw new InternalError("Could not find repo");
        val = await repo
          .override((self as any)._overrides)
          .read(proKeyValue, context);
      }
      results.push(val);
    }
    return results;
  }
  const res = await fetchPopulateValues(
    context,
    model,
    key as string,
    isArr ? nested : [nested]
  );
  (model as any)[key] = isArr ? res : res[0];
}

export async function cascadeDelete<M extends Model, R extends Repo<M>>(
  this: R,
  context: ContextOf<R>,
  data: RelationsMetadata,
  key: keyof M,
  model: M,
  oldModel: M
): Promise<void> {
  if (data.cascade.update !== Cascade.CASCADE) return;
  const nested: any = model[key];
  const isArr = Array.isArray(nested);
  if (typeof nested === "undefined" || (isArr && nested.length === 0)) return;
  if (!oldModel)
    throw new InternalError(
      "No way to compare old model. do you have updateValidation and mergeModels enabled?"
    );

  function reduceToPk(obj: any): any {
    if (Array.isArray(obj)) return obj.map(reduceToPk);
    return typeof obj !== "object" ? obj : obj[Model.pk(obj)];
  }

  const newVal = reduceToPk(model[key]);
  const oldVal = reduceToPk(oldModel[key]);
  if (typeof oldVal === "undefined" || isEqual(newVal, oldVal)) {
    return;
  }
  if (Array.isArray(newVal) !== Array.isArray(oldVal))
    throw new InternalError(`Cannot cascade update for different array types`);
  const newToCompare = (Array.isArray(newVal) ? newVal : [newVal]).filter(
    Boolean
  ) as any[];
  const oldToCompare = (Array.isArray(oldVal) ? oldVal : [oldVal]).filter(
    Boolean
  ) as any[];
  const toDelete = (oldToCompare as any[]).filter(
    (v) => !(newToCompare as any[]).includes(v)
  );
  const repo = repositoryFromTypeMetadata(model, key as keyof M);
  if (!repo) throw new InternalError("Could not find repo");
  console.log("herehere");
  try {
    const deleted = await repo
      .override(this._overrides)
      .deleteAll(toDelete, context);
    context.logger.debug(
      `Deleted ${deleted.length} entries from table ${Model.tableName(repo.class)} due to cascade rules with `
    );
  } catch (e: unknown) {
    throw new InternalError(`Error deleting cascade entries: ${e}`);
  }
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
 *   repositoryFromTypeMetadata->>repositoryFromTypeMetadata: Get allowedTypes array
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
  model: M,
  propertyKey: keyof M,
  alias?: string
): Repo<M> {
  if (!model) throw new Error("No model was provided to get repository");
  let allowedTypes;
  if (Array.isArray(model[propertyKey]) || model[propertyKey] instanceof Set) {
    const customTypes = Metadata.get(
      model instanceof Model ? model.constructor : (model as any),
      Metadata.key(
        ValidationKeys.REFLECT,
        propertyKey as string,
        ValidationKeys.LIST
      )
    )?.clazz;

    if (!customTypes)
      throw new InternalError(
        `Failed to find types decorators for property ${propertyKey as string}`
      );

    allowedTypes = (
      Array.isArray(customTypes) ? [...customTypes] : [customTypes]
    ).map((t) => (typeof t === "function" && !(t as any).name ? t() : t));
  } else
    allowedTypes = Metadata.getPropDesignTypes(
      model instanceof Model ? model.constructor : (model as any),
      propertyKey as string
    )?.designTypes;

  const constructor = allowedTypes?.find(
    (t) => !commomTypes.includes(`${t.name}`.toLowerCase())
  );

  return Repository.forModel(constructor, alias) as any;
}
