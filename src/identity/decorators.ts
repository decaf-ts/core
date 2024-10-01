import { Constructor, required } from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
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

export type IdOnCreateData = {
  sequence?: Constructor<Sequence>;
  options?: SequenceOptions;
};

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
export async function pkOnCreate<T extends DBModel, V extends Repository<T>>(
  this: V,
  data: IdOnCreateData,
  key: string,
  model: T,
): Promise<void> {
  if (!data.sequence) return;

  const setPrimaryKeyValue = function (
    target: T,
    propertyKey: string,
    value: string | number,
  ) {
    Object.defineProperty(target, propertyKey, {
      enumerable: true,
      writable: false,
      configurable: true,
      value: value,
    });
  };

  let sequence: Sequence;
  try {
    sequence = await this.adapter.getSequence(
      model,
      data.sequence,
      data.options,
    );
  } catch (e: any) {
    throw new InternalError(
      `Failed to instantiate Sequence ${data.sequence.name}: ${e}`,
    );
  }

  const next = await sequence.next();
  setPrimaryKeyValue(model, key, next);
}

export function pk(sequence?: Constructor<Sequence>, opts?: SequenceOptions) {
  return apply(
    index(),
    required(),
    readonly(),
    metadata(getDBKey(DBKeys.ID), {}),
    onCreate(pkOnCreate, {
      sequence: sequence,
      options: opts,
    } as IdOnCreateData),
  );
}
