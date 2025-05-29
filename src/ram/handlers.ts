import { Model } from "@decaf-ts/decorator-validation";
import { Repo } from "../repository";
import { RelationsMetadata } from "../model";
import { RamFlags } from "./types";
import { Context } from "@decaf-ts/db-decorators";
import { UnsupportedError } from "../persistence";

/**
 * @description Sets the created by field on a model during RAM create/update operations
 * @summary Automatically populates a model field with the UUID from the context during create or update operations.
 * This function is designed to be used as a handler for RAM operations to track entity creation.
 * @template M - Type of the model being created/updated
 * @template R - Type of the repository handling the model
 * @template V - Type of the relations metadata
 * @template F - Type of the RAM flags
 * @template C - Type of the context
 * @param {R} this - The repository instance
 * @param {Context<F>} context - The operation context containing user identification
 * @param {V} data - The relations metadata
 * @param {keyof M} key - The property key to set with the UUID
 * @param {M} model - The model instance being created/updated
 * @return {Promise<void>} A promise that resolves when the field has been set
 * @function createdByOnRamCreateUpdate
 * @memberOf module:ram
 */
export async function createdByOnRamCreateUpdate<
  M extends Model,
  R extends Repo<M, F, C>,
  V extends RelationsMetadata,
  F extends RamFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const uuid: string = context.get("UUID");
  if (!uuid)
    throw new UnsupportedError(
      "This adapter does not support user identification"
    );
  model[key] = uuid as M[keyof M];
}
