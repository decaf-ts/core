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
  IRepository,
  NotFoundError,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Cascade } from "../repository/constants";
import { Context } from "@decaf-ts/db-decorators";

export async function createOrUpdate<
  M extends Model,
  F extends RepositoryFlags,
>(model: M, context: Context<F>, repository?: Repo<M>): Promise<M> {
  if (!repository) {
    const constructor = Model.get(model.constructor.name);
    if (!constructor)
      throw new InternalError(`Could not find model ${model.constructor.name}`);
    repository = Repository.forModel<M>(
      constructor as unknown as ModelConstructor<M>
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

export async function oneToOneOnCreate<
  M extends Model,
  R extends IRepository<M, F, C>,
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
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  const constructor = Model.get(data.class);
  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  const repo: Repo<any> = Repository.forModel(constructor);
  const created = await repo.create(propertyValue);
  const pk = findPrimaryKey(created).id;
  await cacheModelForPopulate(context, model, key, created[pk], created);
  (model as any)[key] = created[pk];
}

export async function oneToOneOnUpdate<
  M extends Model,
  R extends IRepository<M, F, C>,
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
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as any)[key] = propertyValue;
    return;
  }

  const updated = await createOrUpdate(model[key] as M, context);
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

export async function oneToOneOnDelete<
  M extends Model,
  R extends IRepository<M, F, C>,
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
  const innerRepo: Repo<M> = repositoryFromTypeMetadata(model, key);
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

export async function oneToManyOnCreate<
  M extends Model,
  R extends IRepository<M, F, C>,
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
    const repo = repositoryFromTypeMetadata(model, key);
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
    const record = await createOrUpdate(m, context);
    await cacheModelForPopulate(context, model, key, record[pkName], record);
    result.add(record[pkName]);
  }

  (model as any)[key] = [...result];
}

export async function oneToManyOnUpdate<
  M extends Model,
  R extends IRepository<M, F, C>,
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
  return oneToManyOnUpdate.apply(this as any, [
    context,
    data,
    key as keyof Model,
    model,
  ]);
}

export async function oneToManyOnDelete<
  M extends Model,
  R extends IRepository<M, F, C>,
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
    ? Repository.forModel(values[0])
    : repositoryFromTypeMetadata(model, key);

  const uniqueValues = new Set([
    ...(isInstantiated
      ? values.map((v: Record<string, any>) => v[repo.pk as string])
      : values),
  ]);

  for (const id of uniqueValues.values()) {
    const deleted = await repo.delete(id, context);
    await cacheModelForPopulate(context, model, key, id, deleted);
  }
  (model as any)[key] = [...uniqueValues];
}

export function getPopulateKey(
  tableName: string,
  fieldName: string,
  id: string | number
) {
  return [PersistenceKeys.POPULATE, tableName, fieldName, id].join(".");
}

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

export async function populate<
  M extends Model,
  R extends IRepository<M, F, C>,
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
    propKeyValues: any[]
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
        const repo = repositoryFromTypeMetadata(model, propName);
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
    isArr ? nested : [nested]
  );
  (model as any)[key] = isArr ? res : res[0];
}

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

export function repositoryFromTypeMetadata<M extends Model>(
  model: any,
  propertyKey: string | keyof M
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

  const allowedTypes: string[] = Array.isArray(customTypes)
    ? [...customTypes]
    : [customTypes];
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

  return Repository.forModel(constructor);
}
