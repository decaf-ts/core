import { Model } from "@decaf-ts/decorator-validation";
import { Repo } from "../repository";
import { RelationsMetadata } from "../model";
import { RamFlags } from "./types";
import { Context } from "@decaf-ts/db-decorators";
import { UnsupportedError } from "../persistence";

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
