import {
  Decoration,
  Model,
  propMetadata,
  required,
} from "@decaf-ts/decorator-validation";
import {
  DefaultSequenceOptions,
  SequenceOptions,
} from "../interfaces/SequenceOptions";
import {
  DBKeys,
  GroupSort,
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

const defaultPkPriority = 60; // Default priority for primary key to run latter than other properties

/**
 * @description Callback function for primary key creation
 * @summary Handles the creation of primary key values for models using sequences
 * @template M - Type that extends Model
 * @template R - Type that extends Repo<M, F, C>
 * @template V - Type that extends SequenceOptions
 * @template F - Type that extends RepositoryFlags
 * @template C - Type that extends Context<F>
 * @param {Context<F>} context - The execution context
 * @param {V} data - The sequence options
 * @param key - The property key to set as primary key
 * @param {M} model - The model instance
 * @return {Promise<void>} A promise that resolves when the primary key is set
 * @function pkOnCreate
 * @category Property Decorators
 * @mermaid
 * sequenceDiagram
 *   participant Model
 *   participant pkOnCreate
 *   participant Adapter
 *   participant Sequence
 *
 *   Model->>pkOnCreate: Call with model instance
 *   Note over pkOnCreate: Check if key already exists
 *   alt Key exists or no type specified
 *     pkOnCreate-->>Model: Return early
 *   else Key needs to be created
 *     pkOnCreate->>pkOnCreate: Generate sequence name if not provided
 *     pkOnCreate->>Adapter: Request Sequence(data)
 *     Adapter->>Sequence: Create sequence
 *     Sequence-->>pkOnCreate: Return sequence
 *     pkOnCreate->>Sequence: Call next()
 *     Sequence-->>pkOnCreate: Return next value
 *     pkOnCreate->>Model: Set primary key value
 *   end
 */
export async function pkOnCreate<
  M extends Model,
  R extends Repo<M, F, C>,
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
  if (!data.type || !data.generated || model[key]) {
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

/**
 * @description Primary Key Decorator
 * @summary Marks a property as the model's primary key with automatic sequence generation
 * This decorator combines multiple behaviors: it marks the property as unique, required,
 * and ensures the index is created properly according to the provided sequence options.
 * @param {Omit<SequenceOptions, "cycle" | "startWith" | "incrementBy">} opts - Options for the sequence generation
 * @return {PropertyDecorator} A property decorator that can be applied to model properties
 * @function pk
 * @category Property Decorators
 * @example
 * ```typescript
 * class User extends BaseModel {
 *   @pk()
 *   id!: string;
 *
 *   @required()
 *   username!: string;
 * }
 * ```
 */
export function pk(
  opts: Omit<
    SequenceOptions,
    "cycle" | "startWith" | "incrementBy"
  > = DefaultSequenceOptions
) {
  opts = Object.assign({}, DefaultSequenceOptions, opts, {
    generated:
      opts.type && typeof opts.generated === "undefined"
        ? true
        : opts.generated || DefaultSequenceOptions.generated,
  }) as SequenceOptions;

  const key = Repository.key(DBKeys.ID);
  function pkDec(options: SequenceOptions, groupsort?: GroupSort) {
    return function pkDec(obj: any, attr: any) {
      return apply(
        index([OrderDirection.ASC, OrderDirection.DSC]),
        required(),
        readonly(),
        propMetadata(key, options),
        onCreate(pkOnCreate, options, groupsort),
        propMetadata(DBKeys.ID, attr)
      )(obj, attr);
    };
  }
  return Decoration.for(key)
    .define({
      decorator: pkDec,
      args: [opts, { priority: defaultPkPriority }],
    })
    .apply();
}
