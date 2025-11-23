import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter, type Migration, PersistenceKeys } from "../persistence/index";
import { type ExtendedRelationsMetadata } from "../model";

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

(Metadata as any).migrationsFor = function <
  A extends Adapter<any, any, any, any>,
>(adapter?: A): Constructor<Migration<any, A>>[] {
  adapter = adapter ?? (Adapter.current as A);
  if (!adapter) throw new InternalError(`Could not get adapter for migrations`);
  const migrations = Metadata["innerGet"](
    Symbol.for(PersistenceKeys.MIGRATION),
    adapter.alias
  );
  return migrations.map(
    (m: { class: Constructor<Migration<any, A>> }) => m.class
  );
}.bind(Metadata);

(Metadata as any).relations = function <M extends Model>(
  m: Constructor<M>,
  prop?: keyof M
): string[] | ExtendedRelationsMetadata | undefined {
  const meta = Metadata.get(m, PersistenceKeys.RELATIONS);
  if (!meta) return undefined;
  if (!prop) return Object.keys(meta);
  if (!meta[prop as string])
    throw new InternalError(
      `No relations metadata found for property ${prop as string}`
    );
  return meta[prop as string];
}.bind(Metadata);

(Model as any).relations = function <M extends Model>(
  m: Constructor<M>,
  prop?: keyof M
): string[] | ExtendedRelationsMetadata {
  return Metadata.relations(m, prop) || [];
};
