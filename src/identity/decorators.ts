import { Model, required } from "@decaf-ts/decorator-validation";
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
import { Repo } from "../repository/Repository";
import { index } from "../model/decorators";
import { sequenceNameForModel } from "./utils";
import { Sequence } from "../persistence/Sequence";
import { Context } from "@decaf-ts/db-decorators";
import { OrderDirection } from "../repository";
import {
  apply,
  Decoration,
  Metadata,
  prop,
  propMetadata,
} from "@decaf-ts/decoration";

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


export function pkDec(options: SequenceOptions, groupsort?: GroupSort) {
    return function pkDec(obj: any, attr: any) {
      prop()(obj, attr)
      switch (options.type) {
        case undefined: {
          const metaType = Metadata.type(obj, attr);
          if (![Number, String, BigInt].includes(metaType)) throw new Error('Incorrrect option type');
          options.type = metaType;
          break;
        }
        case String: 
          options.generated = false;
          break;
        case Number: 
        case BigInt: 
          options.generated = true;
          break;
        case "uuid":
        case "serial":
          case "string":
          break;
        case "String": 
          options.type = String;
          console.warn('Deprecated "String" type in options');
          break;
        case "Number": 
          options.type = Number;
          console.warn('Deprecated "Number" type in options');
          break;
        case "Bigint": 
          options.type = BigInt;
          console.warn('Deprecated "BigInt" type in options');
          break;
        default: 
          throw new Error('Unsupported type')
      }

      return apply(
        index([OrderDirection.ASC, OrderDirection.DSC]),
        required(),
        readonly(),
        // Model.pk neeeds to get the pk property name from the first property of Metatada[DBKeys.ID] ---> { [DBKeys.ID]: { [attr]:options }}
        propMetadata(Metadata.key(DBKeys.ID, attr), options),
        onCreate(pkOnCreate, options, groupsort)
      )(obj, attr);
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
  opts: Omit<
    SequenceOptions,
    "cycle" | "startWith" | "incrementBy"
  > = DefaultSequenceOptions
) {
  const key = DBKeys.ID;
  
  return Decoration.for(key)
    .define({
      decorator: pkDec,
      args: [opts, { priority: defaultPkPriority }],
    })
    .apply();
}
