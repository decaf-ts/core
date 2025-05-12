import { Model, propMetadata, required } from "@decaf-ts/decorator-validation";
import {
  DefaultSequenceOptions,
  SequenceOptions,
} from "../interfaces/SequenceOptions";
import {
  DBKeys,
  InternalError,
  onCreate,
  readonly,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Repo, Repository } from "../repository/Repository";
import { index } from "../model/decorators";
import { sequenceNameForModel } from "./utils";
import { Sequence } from "../persistence/Sequence";
import { Context } from "@decaf-ts/db-decorators";
import { OrderDirection } from "../repository";
import { apply } from "@decaf-ts/reflection";

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
export async function pkOnCreate<
  M extends Model,
  R extends Repo<M, C, F>,
  V extends SequenceOptions,
  F extends RepositoryFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  if (!data.type || model[key]) {
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
  setPrimaryKeyValue(model, key as string, next);
}

export function pk(
  opts: Omit<
    SequenceOptions,
    "cycle" | "startWith" | "incrementBy"
  > = DefaultSequenceOptions
) {
  opts = Object.assign({}, DefaultSequenceOptions, opts) as SequenceOptions;
  return apply(
    index([OrderDirection.ASC, OrderDirection.DSC]),
    required(),
    readonly(),
    // type([String.name, Number.name, BigInt.name]),
    propMetadata(Repository.key(DBKeys.ID), opts as SequenceOptions),
    onCreate(pkOnCreate, opts as SequenceOptions)
  );
}
