import { required } from "@decaf-ts/decorator-validation";
import {
  DefaultSequenceOptions,
  SequenceOptions,
} from "../interfaces/SequenceOptions";
import { Sequence } from "../interfaces/Sequence";
import {
  DBKeys,
  DBModel,
  getDBKey,
  InternalError,
  onCreate,
  readonly,
} from "@decaf-ts/db-decorators";
import { apply, metadata } from "@decaf-ts/reflection";
import { Repository } from "../repository/Repository";
import { index } from "../model/decorators";
import { sequenceNameForModel } from "./utils";

/**
 * @summary Primary Key Decorator
 * @description Marks the property as the {@link DBModel}s primary key.
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
export async function pkOnCreate<
  M extends DBModel,
  V extends Repository<M, any>,
>(this: V, data: SequenceOptions, key: string, model: M): Promise<void> {
  if (!data.type) return;

  const setPrimaryKeyValue = function (
    target: M,
    propertyKey: string,
    value: string | number | bigint,
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
      `Failed to instantiate Sequence ${data.name}: ${e}`,
    );
  }

  const next = await sequence.next();
  setPrimaryKeyValue(model, key, next);
}

export function pk(opts: SequenceOptions = DefaultSequenceOptions) {
  return apply(
    index(),
    required(),
    readonly(),
    metadata(getDBKey(DBKeys.ID), opts),
    onCreate(pkOnCreate, opts),
  );
}
