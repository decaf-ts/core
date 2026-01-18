import { Model, required } from "@decaf-ts/decorator-validation";
import {
  DefaultSequenceOptions,
  SequenceOptions,
} from "../interfaces/SequenceOptions";
import {
  DBKeys,
  generated,
  GroupSort,
  InternalError,
  onCreate,
  readonly,
} from "@decaf-ts/db-decorators";
import { index } from "../model/decorators";
import type { Sequence } from "../persistence/Sequence";
import { OrderDirection } from "../repository/constants";
import {
  apply,
  Decoration,
  Metadata,
  prop,
  propMetadata,
} from "@decaf-ts/decoration";
import { Repository } from "../repository/Repository";
import { ContextOf } from "../persistence/types";
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
  R extends Repository<M, any>,
  V extends SequenceOptions,
>(
  this: R,
  context: ContextOf<R>,
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
    Reflect.set(target, propertyKey, value);
  };

  if (!data.name) data.name = Model.sequenceName(model, "pk");
  let sequence: Sequence;
  try {
    sequence = await this.adapter.Sequence(data, this._overrides);
  } catch (e: any) {
    throw new InternalError(
      `Failed to instantiate Sequence ${data.name}: ${e}`
    );
  }

  const next = await sequence.next(context);
  setPrimaryKeyValue(model, key as string, next);
}

export function pkDec(options: SequenceOptions, groupsort?: GroupSort) {
  return function pkDec(obj: any, attr: any) {
    prop()(obj, attr);
    if (!options.type) {
      const metaType = Metadata.type(obj.constructor, attr);
      if (
        ![Number.name, String.name, BigInt.name].includes(
          metaType?.name || metaType
        )
      )
        throw new Error("Incorrrect option type");
      options.type = metaType;
    }
    switch (options.type) {
      case String.name || String.name.toLowerCase():
        console.warn(`Deprecated "${options.type}" type in options`);
      // eslint-disable-next-line no-fallthrough
      case String:
        options.generated =
          typeof options.generated === "undefined" ? false : options.generated;
        options.type = String;
        break;
      case Number.name || String.name.toLowerCase():
        console.warn(`Deprecated "${options.type}" type in options`);
      // eslint-disable-next-line no-fallthrough
      case Number:
        options.generated =
          typeof options.generated === "undefined" ? true : options.generated;
        options.type = Number;
        break;
      case BigInt.name || BigInt.name.toLowerCase():
        console.warn(`Deprecated "${options.type}" type in options`);
      // eslint-disable-next-line no-fallthrough
      case BigInt:
        options.type = BigInt;
        options.generated =
          typeof options.generated === "undefined" ? true : options.generated;
        break;
      case "uuid":
      case "serial":
        options.generated = true;
        break;
      default:
        throw new Error("Unsupported type");
    }
    if (typeof options.generated === "undefined") {
      options.generated = true;
    }

    const decs = [
      index([OrderDirection.ASC, OrderDirection.DSC]),
      prop(),
      required(),
      readonly(),
      propMetadata(Metadata.key(DBKeys.ID, attr), options),
      onCreate(pkOnCreate, options, groupsort),
    ];
    if (options.generated) decs.push(generated());
    return apply(...decs)(obj, attr);
  };
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
  opts?: Partial<Omit<SequenceOptions, "cycle" | "startWith" | "incrementBy">>
) {
  // We want to handle options.generated in the decorator function
  const DefaultSequenceOptionsMin = Object.assign({}, DefaultSequenceOptions);
  delete DefaultSequenceOptionsMin.generated;
  opts = Object.assign({}, DefaultSequenceOptionsMin, opts) as SequenceOptions;
  return Decoration.for(DBKeys.ID)
    .define({
      decorator: pkDec,
      args: [opts, { priority: defaultPkPriority }],
    })
    .apply();
}
