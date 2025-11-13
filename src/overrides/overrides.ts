import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
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

(Model as any).shouldValidateNestedHandler = function <M extends Model>(
  model: M,
  property: keyof M
): boolean {
  const metadata: any = Metadata.get(model.constructor as Constructor<M>);
  if (!metadata) return false;
  const relations = metadata[PersistenceKeys.RELATIONS];
  const relation = metadata[PersistenceKeys.RELATION];
  if (Array.isArray(relations) && relations?.includes(property)) {
    const relationName = Object.keys(relation)[0];
    const relationClassName = Model.isPropertyModel(model, property as string);

    return (
      relation[relationName]?.class !== relationClassName
      // TODO: Revisit this
      // ||
      // relation[relationName]?.populate !== false
    );
  }
  return true;
}.bind(Model);
