import {
  Constructor,
  Model,
  Validation,
  ValidationKeys,
} from "@decaf-ts/decorator-validation";
import { Repository } from "../repository/Repository";
import { RelationsMetadata } from "./types";
import {
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
  repository?: Repository<M>
): Promise<M> {
  if (!repository) {
    const constructor = Model.get(model.constructor.name);
    if (!constructor)
      throw new InternalError(`Could not find model ${model.constructor.name}`);
    repository = Repository.forModel(constructor) as Repository<M>;
  }
  if (typeof (model as Record<string, any>)[repository.pk] === "undefined")
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
  const innerRepo: Repository<M> = repositoryFromTypeMetadata(model, key);
  let deleted: M;
  if (!(propertyValue instanceof Model))
    deleted = await innerRepo.delete(
      (model as Record<string, any>)[key],
      context
    );
  else
    deleted = await innerRepo.delete(
      (model as Record<string, any>)[key][innerRepo.pk],
      context
    );
  await cacheModelForPopulate(
    context,
    model,
    key,
    (deleted as Record<string, any>)[innerRepo.pk],
    deleted
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
>(this: R, context: Context<M>, data: Y, key: string, model: M): Promise<void> {
  if (data.cascade.delete !== Cascade.CASCADE) return;
  const values = (model as Record<string, any>)[key];
  if (!values || !values.length) return;
  const arrayType = typeof values[0];
  const areAllSameType = values.every((item: any) => typeof item === arrayType);
  if (!areAllSameType)
    throw new InternalError(
      `Invalid operation. All elements of property ${key} must match the same type.`
    );
  const isInstantiated = arrayType === "object";
  const repo = isInstantiated
    ? Repository.forModel(values[0])
    : repositoryFromTypeMetadata(model, key);

  const uniqueValues = new Set([
    ...(isInstantiated
      ? values.map((v: Record<string, any>) => v[repo.pk])
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
  const isArr = Array.isArray(nested);
  if (typeof nested === "undefined" || (isArr && nested.length === 0)) return;

  async function fetchPopulateValues(
    c: Context<M>,
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
        val = await c.get(cacheKey);
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
    key,
    isArr ? nested : [nested]
  );
  (model as Record<string, any>)[key] = isArr ? res : res[0];
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
