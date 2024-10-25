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
import { Context } from "@decaf-ts/db-decorators/lib/repository/Context";

export async function createOrUpdate<M extends Model>(
  model: M,
  context: Context<M>,
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
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as Record<string, any>)[key] = propertyValue;
    return;
  }

  const constructor = Model.get(data.class);
  if (!constructor)
    throw new InternalError(`Could not find model ${data.class}`);
  const repo: Repository<any> = Repository.forModel(constructor);
  const created = await repo.create(propertyValue);
  const pk = findPrimaryKey(created).id;
  await cacheModelForPopulate(context, model, key, created[pk], created);
  (model as any)[key] = created[pk];
}

export async function oneToOneOnUpdate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;

  if (typeof propertyValue !== "object") {
    const innerRepo = repositoryFromTypeMetadata(model, key);
    const read = await innerRepo.read(propertyValue);
    await cacheModelForPopulate(context, model, key, propertyValue, read);
    (model as Record<string, any>)[key] = propertyValue;
    return;
  }

  const updated = await createOrUpdate(
    (model as Record<string, any>)[key],
    context
  );
  const pk = findPrimaryKey(updated).id;
  await cacheModelForPopulate(
    context,
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
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  const propertyValue: any = (model as Record<string, any>)[key];
  if (!propertyValue) return;
  if (data.cascade.update !== Cascade.CASCADE) return;
  const innerRepo = repositoryFromTypeMetadata(model, key);
  if (!(propertyValue instanceof Model))
    await innerRepo.delete((model as Record<string, any>)[key], context);
  else
    await innerRepo.delete(
      findModelId((model as Record<string, any>)[key]),
      context
    );
}

export async function oneToManyOnCreate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
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
      await cacheModelForPopulate(context, model, key, id, read);
    }
    (model as any)[key] = uniqueValues;
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
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  const { cascade } = data;
  if (cascade.update !== Cascade.CASCADE) return;
  return oneToManyOnCreate.call(this, context, data, key, model);
}

export async function oneToManyOnDelete<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(
  this: R,
  context: Context<M>,
  data: Y,
  key: string,
  id: string
): Promise<void> {
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

export async function cacheModelForPopulate<M extends Model>(
  context: Context<M>,
  parentModel: M,
  propertyKey: string,
  pkValue: string | number,
  cacheValue: any
) {
  const cacheKey = getPopulateKey(
    parentModel.constructor.name,
    propertyKey,
    pkValue
  );
  return context.put(cacheKey, cacheValue);
}

export async function populate<
  M extends Model,
  R extends Repository<M>,
  Y extends RelationsMetadata,
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  if (!data.populate) return;
  const nested: any = (model as Record<string, any>)[key];
  if (
    typeof nested === "undefined" ||
    (Array.isArray(nested) && nested.length === 0)
  )
    return;

  async function fetchPopulateValue(
    c: Context<M>,
    model: M,
    propName: string,
    propKeyValue: any
  ) {
    const cacheKey = getPopulateKey(
      model.constructor.name,
      propName,
      propKeyValue
    );
    return c.get(cacheKey);
  }
  if (!Array.isArray(nested)) {
    (model as any)[key] = await fetchPopulateValue(
      context,
      model,
      key,
      (model as Record<string, any>)[key]
    );
    return;
  }

  const result: M[] = [];

  for (const v of nested) {
    const record = await fetchPopulateValue(context, model, key, v);
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
