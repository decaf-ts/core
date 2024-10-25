import {
  Constructor,
  Model,
  Validation,
  ValidationKeys,
} from "@decaf-ts/decorator-validation";
import { Repository } from "../repository/Repository";
import { RelationsMetadata } from "./types";
import {
  findModelId,
  findPrimaryKey,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/constants";
import { Cascade } from "../repository/constants";

export async function createOrUpdate<M extends Model>(
  model: M,
  repository: Repository<M> | undefined = undefined,
  pk?: string
): Promise<M> {
  if (!repository) {
    const constructor = Model.get(model.constructor.name);
    if (!constructor)
      throw new InternalError(`Could not find model ${model.constructor.name}`);
    repository = Repository.forModel(constructor) as Repository<M>;
  }
  if (!pk) pk = findPrimaryKey(model).id;
  if (typeof (model as Record<string, any>)[pk] === "undefined")
    return repository.create(model);
  else {
    try {
      return repository.update(model);
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) throw e;
      return repository.create(model);
    }
  }
}

export async function oneToOneOnCreate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate.call(this, model, key, propertyValue, read);
    (model as Record<string, any>)[key] = propertyValue;
    return;
  }

  const constructor = Model.get(data.class);
  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  const repo: Repository<any> = Repository.forModel(constructor);
  const created = await repo.create(propertyValue);
  const pk = findPrimaryKey(created).id;
  await cacheModelForPopulate.call(this, model, key, created[pk], created);
  (model as any)[key] = created[pk];
}

export async function oneToOneOnUpdate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate.call(this, model, key, propertyValue, read);
    (model as Record<string, any>)[key] = propertyValue;
    return;
  }

  const updated = await createOrUpdate((model as Record<string, any>)[key]);
  const pk = findPrimaryKey(updated).id;
  await cacheModelForPopulate.call(
    this,
    model,
    key,
    (updated as Record<string, any>)[pk],
    updated
  );
  (model as any)[key] = (updated as Record<string, any>)[pk];
}

export async function oneToOneOnDelete<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;
  const innerRepo = repositoryFromTypeMetadata(model, key);
  if (!(propertyValue instanceof Model))
    await innerRepo.delete((model as Record<string, any>)[key]);
  else await innerRepo.delete(findModelId((model as Record<string, any>)[key]));
}

export async function oneToManyOnCreate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  const propertyValues: any = (model as Record<string, any>)[key];
  if (!propertyValues || !propertyValues.length) return;
  const arrayType = typeof propertyValues[0];
  if (!propertyValues.every((item: any) => typeof item === arrayType))
    throw new InternalError(
      `Invalid operation. All elements of property ${key} must match the same type.`
    );
  const uniqueValues = new Set([...propertyValues]);
  if (arrayType !== "object") {
    const repo = repositoryFromTypeMetadata(model, key);
    for (const id of uniqueValues) {
      const read = await repo.read(id);
      await cacheModelForPopulate.call(this, model, key, id, read);
    }
    (model as any)[key] = uniqueValues;
    return;
  }

  const pkName = findPrimaryKey(propertyValues[0]).id;

  const result = new Set();

  for (const m of propertyValues) {
    const record = await createOrUpdate(m);
    await cacheModelForPopulate.call(this, model, key, record[pkName], record);
    result.add(record);
  }

  (model as any)[key] = [...result];
}

export async function oneToManyOnUpdate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return oneToManyOnCreate.call(this, data, key, model);
}

export async function oneToManyOnDelete<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, id: string): Promise<void> {
  if (data.cascade.delete !== Cascade.CASCADE) return;
  const model = await this.read(id);
  const values = (model as Record<string, any>)[key];
  if (!values || !values.length) return;
  const arrayType = typeof values[0];
  const areAllSameType = values.every((item: any) => typeof item === arrayType);
  if (!areAllSameType)
    throw new InternalError(
      `Invalid operation. All elements of property ${key} must match the same type.`
    );
  const isInstantiated = arrayType === Object.name;
  const repo = isInstantiated
    ? Repository.forModel(values[0])
    : repositoryFromTypeMetadata(model, key);
  let pk: string;
  if (isInstantiated) pk = findPrimaryKey(values[0]).id;
  const uniqueValues = new Set([
    ...(isInstantiated
      ? values
      : values.map((v: Record<string, any>) => v[pk])),
  ]);

  for (const id of uniqueValues) {
    const deleted = await repo.delete(id);
    await cacheModelForPopulate.call(this, model, key, id, deleted);
  }
  (model as any)[key] = [...uniqueValues];
}

export function getPopulateKey(
  tableName: string,
  fieldName: string,
  id: string | number
) {
  return `${PersistenceKeys.POPULATE}-${tableName}-${fieldName}-${id}`;
}

export async function cacheModelForPopulate(
  this: Repository<any>,
  parentModel: any,
  propertyKey: string,
  pkValue: string | number,
  cacheValue: any
) {
  const cacheKey = getPopulateKey(
    parentModel.constructor.name,
    propertyKey,
    pkValue
  );
  return this.cache.put(cacheKey, cacheValue);
}

export async function populate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, data: Y, key: string, model: M): Promise<void> {
  if (!data.populate) return;
  const nested: any = (model as Record<string, any>)[key];
  if (
    typeof nested === "undefined" ||
    (Array.isArray(nested) && nested.length === 0)
  )
    return;

  async function fetchPopulateValue(
    this: Repository<any>,
    model: Model,
    propName: string,
    propKeyValue: any
  ) {
    const cacheKey = getPopulateKey(
      model.constructor.name,
      propName,
      propKeyValue
    );
    return this.cache.get(cacheKey);
  }
  if (!Array.isArray(nested)) {
    (model as any)[key] = await fetchPopulateValue.call(
      this,
      model,
      key,
      (model as Record<string, any>)[key]
    );
    return;
  }

  const result: M[] = [];

  for (const v of nested) {
    const record = await fetchPopulateValue.call(this, model, key, v);
    result.concat([record]);
  }
  (model as Record<string, any>)[key] = result;
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
  propertyKey: string
): Repository<M> {
  const types = Reflect.getMetadata(
    Validation.key(
      Array.isArray(model[propertyKey])
        ? ValidationKeys.LIST
        : ValidationKeys.TYPE
    ),
    model,
    propertyKey
  );
  const customTypes: any = Array.isArray(model[propertyKey])
    ? types.class
    : types.customTypes;
  if (!types || !customTypes)
    throw new InternalError(
      `Failed to find types decorators for property ${propertyKey}`
    );

  const allowedTypes: string[] = Array.isArray(customTypes)
    ? [...customTypes]
    : [customTypes];
  const constructorName = allowedTypes.find(
    (t) => !commomTypes.includes(`${t}`.toLowerCase())
  );
  if (!constructorName)
    throw new InternalError(
      `Property key ${propertyKey} does not have a valid constructor type`
    );
  const constructor: Constructor<M> | undefined = Model.get(constructorName);
  if (!constructor)
    throw new InternalError(`No registered model found for ${constructorName}`);

  return Repository.forModel(constructor);
}
