import { PersistenceKeys } from "./constants";
import { Model, required } from "@decaf-ts/decorator-validation";
import {
  generated,
  onCreate,
  onUpdate,
  readonly,
} from "@decaf-ts/db-decorators";
import { apply, Decoration } from "@decaf-ts/decoration";
import { ContextOfRepository } from "./types";
import { Repo } from "../repository/Repository";
import { UUID } from "./generators";

/**
 * @description Handler function that sets a timestamp property to the current timestamp.
 * @summary Updates a model property with the current timestamp from the repository context.
 * @template M - The model type extending Model
 * @template R - The repository type extending IRepository
 * @template V - The data type for the operation
 * @template F - The repository flags type
 * @template C - The context type
 * @param {C} context - The repository context containing the current timestamp
 * @param {V} data - The data being processed
 * @param key - The property key to update
 * @param {M} model - The model instance being updated
 * @return {Promise<void>} A promise that resolves when the timestamp has been set
 * @function uuidCreateUpdateHandler
 */
export async function uuidCreateUpdateHandler<
  M extends Model<boolean>,
  R extends Repo<M>,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: UUIDMetadata,
  key: keyof M,
  model: M
): Promise<void> {
  if (
    context.get("allowGenerationOverride") &&
    typeof model[key] !== "undefined"
  ) {
    return;
  }
  (model as any)[key] = UUID.instance.generate(...(data.args || []));
}

export type UUIDMetadata = {
  update: boolean;
  args?: any[];
};
export function uuid(update: boolean = false, ...args: any[]) {
  const decorationKey = PersistenceKeys.UUID;

  function uuid(update: boolean, ...args: any[]) {
    const meta: UUIDMetadata = { update: update, args: args };
    const decorators: any[] = [
      required(),
      generated(PersistenceKeys.UUID),
      onCreate(uuidCreateUpdateHandler, meta),
    ];
    if (update) decorators.push(onUpdate(uuidCreateUpdateHandler, meta));
    if (!update) decorators.push(readonly());
    return apply(...decorators);
  }

  return Decoration.for(decorationKey)
    .define({
      decorator: uuid,
      args: [update, ...args],
    })
    .apply();
}
