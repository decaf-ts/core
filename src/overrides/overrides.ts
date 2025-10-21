import { Metadata } from "@decaf-ts/decoration";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { PersistenceKeys } from "../persistence/index";

(Metadata as any).validationExceptions = function <M extends Model>(
  this: Metadata,
  model: Constructor<M>,
  op: OperationKeys
): string[] {
  const noValidation: Record<string, OperationKeys[]> | undefined =
    Metadata.get(model, PersistenceKeys.NO_VALIDATE);
  if (!noValidation) return [];

  return Object.entries(noValidation)
    .filter(([, val]) => val.includes(op))
    .map(([key]) => key);
}.bind(Metadata);
