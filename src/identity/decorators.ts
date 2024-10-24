import { propMetadata, required, Model } from "@decaf-ts/decorator-validation";
import {
  DefaultSequenceOptions,
  SequenceOptions,
} from "../interfaces/SequenceOptions";
import { Sequence } from "../interfaces/Sequence";
import {
  DBKeys,
  InternalError,
  onCreate,
  readonly,
} from "@decaf-ts/db-decorators";
import { apply } from "@decaf-ts/reflection";
import { Repository } from "../repository/Repository";
import { index } from "../model/decorators";
import { sequenceNameForModel } from "./utils";

/**
 * @summary Primary Key Decorator
 * @description Marks the property as the {@link Model}s primary key.
 *  Also marks the property as {@link unique} as {@required} and ensures the index is created properly according to the provided {@link Sequence}
 *
 *
 *
 * @function pk
 *
 * @memberOf module:wallet-db.Decorators
 *
 * @see unique
 * @see required
 * @see on
 * @param data
 * @param key
 * @param model
 */
export async function pkOnCreate<M extends Model, V extends Repository<M, any>>(
  this: V,
  data: SequenceOptions,
  key: string,
  model: M
): Promise<void> {
  if (!data.type || (model as Record<string, any>)[key]) {
    return;
  }

  const setPrimaryKeyValue = function <M extends Model>(
    target: M,
    propertyKey: string,
    value: string | number | bigint
  ) {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      writable: false,
      configurable: true,
      value: value,
    });
  };
  if (!data.name) data.name = sequenceNameForModel(model, "pk");
  let sequence: Sequence;
  try {
    sequence = await this.adapter.Sequence(data);
  } catch (e: any) {
    throw new InternalError(
      `Failed to instantiate Sequence ${data.name}: ${e}`
    );
  }

  const next = await sequence.next();
  setPrimaryKeyValue(model, key, next);
}

export function pk(
  opts: Omit<
    SequenceOptions,
    "cycle" | "startWith" | "incrementBy"
  > = DefaultSequenceOptions
) {
  opts = Object.assign({}, DefaultSequenceOptions, opts) as SequenceOptions;
  return apply(
    index(),
    required(),
    readonly(),
    // type([String.name, Number.name, BigInt.name]),
    propMetadata(Repository.key(DBKeys.ID), opts as SequenceOptions),
    onCreate(pkOnCreate, opts as SequenceOptions)
  );
}
