import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { DBKeys, InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter } from "../persistence/Adapter";

import { PersistenceKeys } from "../persistence/constants";
import { UnsupportedError } from "../persistence/errors";
import { type ExtendedRelationsMetadata } from "../model";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { IndexMetadata } from "../repository/types";
import { Repository } from "../repository/Repository";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { Service } from "../services/services";
import { TaskHandler } from "../tasks/TaskHandler";
import { TasksKey } from "../tasks/index";
import { type Migration } from "../migrations/types";

(Metadata as any).tasks = function tasks():
  | Record<string, Constructor<TaskHandler<any, any>>>
  | undefined {
  return Metadata["innerGet"](Symbol.for(TasksKey));
}.bind(Metadata);

(Metadata as any).taskFor = function taskFor(
  type: string
): Constructor<TaskHandler<any, any>> | undefined {
  const meta = Metadata.tasks();
  return meta ? meta[type] : undefined;
}.bind(Metadata);

(Metadata as any).validationExceptions = function validationExceptions<
  M extends Model,
>(this: Metadata, model: Constructor<M>, op: OperationKeys): string[] {
  const noValidation: string[] =
    Metadata.get(model, PersistenceKeys.NO_VALIDATE) || [];
  const novalidationEntries = Object.entries(noValidation)
    .filter(([, val]) => val.includes(op))
    .map(([key]) => key);
  let nestedRels: string[] = [];
  if (op === OperationKeys.CREATE || op === OperationKeys.UPDATE)
    nestedRels = Model.nestedRelations(model);
  return [...new Set([...novalidationEntries, ...nestedRels])];
}.bind(Metadata);

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

(Metadata as any).migrations = function migrations(): [
  string,
  Constructor<Migration<any, any>>,
][] {
  const migrations: Record<
    string,
    Record<string, Constructor<Migration<any, any>>>
  > = Metadata["innerGet"](Symbol.for(PersistenceKeys.MIGRATION));
  return Object.entries(migrations)
    .map(([, v]) => Object.entries(v))
    .flat();
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
  m: Constructor<M> | M,
  prop?: keyof M
): string[] | ExtendedRelationsMetadata {
  return (
    Metadata.relations(
      m instanceof Model ? (m.constructor as Constructor<M>) : m,
      prop
    ) || []
  );
};

(Model as any).nestedRelations = function <M extends Model>(
  model: Constructor<M> | M,
  existingRelations: string[] = []
): string[] | ExtendedRelationsMetadata {
  let inner: string[] = [];
  const rels = Metadata.get(model as Constructor<M>, PersistenceKeys.RELATIONS);
  if (!rels || !Object.keys(rels).length)
    return [...new Set([...existingRelations])];
  for (const prop in rels) {
    const relationMeta = rels[prop] as any;
    if (relationMeta?.class && Model.relations(relationMeta.class)) {
      const innerModelRels = Model.relations(relationMeta.class) as string[];
      const innerModelDotRels = innerModelRels.map((r) => `${prop}.${r}`);
      existingRelations = [...existingRelations, ...innerModelDotRels];
      inner = Model.nestedRelations(relationMeta.class, existingRelations);
    }
  }
  return [...new Set([...existingRelations, ...inner])];
}.bind(Model);

(Model as any).generatedBySequence = function generatedBySequence<
  M extends Model,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
>(model: M | Constructor<M>, prop?: keyof M): boolean {
  const constr =
    typeof model !== "function" ? (model.constructor as any) : model;
  const seq = Model.sequenceFor(constr);
  return !!seq.generated;
}.bind(Model);

(Metadata as any).createdBy = function createdBy<M extends Model>(
  model: M | Constructor<M>
): keyof M {
  const meta = Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    PersistenceKeys.CREATED_BY
  );
  if (!meta)
    throw new InternalError(
      `No createdBy metadata found for model. did you use @createdBy()?`
    );
  return meta;
}.bind(Metadata);

(Metadata as any).updatedBy = function updatedBy<M extends Model>(
  model: M | Constructor<M>
): keyof M {
  const meta = Metadata.get(
    typeof model !== "function" ? (model.constructor as any) : model,
    PersistenceKeys.UPDATED_BY
  );
  if (!meta)
    throw new InternalError(
      `No updatedBy metadata found for model. did you use @updatedBy()?`
    );
  return meta;
}.bind(Metadata);

(Model as any).tableName = function <M extends Model>(
  model: Constructor<M> | M
): string {
  const obj =
    model instanceof Model ? Model.get(model.constructor.name) : model;

  if (!obj) throw new InternalError(`Unable to find model ${model}`);

  const meta = Metadata.get(
    model instanceof Model ? model.constructor : (model as any),
    PersistenceKeys.TABLE
  );

  if (meta) {
    return meta;
  }
  if (model instanceof Model) {
    return model.constructor.name;
  }
  return model.name;
};

(Model as any).columnName = function <M extends Model>(
  model: Constructor<M> | M,
  attribute: keyof M
): string {
  const metadata = Metadata.get(
    model instanceof Model ? model.constructor : (model as any),
    Metadata.key(PersistenceKeys.COLUMN, attribute as string)
  );
  return metadata ? metadata : (attribute as string);
};

(Model as any).sequenceName = function <M extends Model>(
  model: M | Constructor<M>,
  ...args: string[]
): string {
  return [Model.tableName(model), ...args].join("_");
};

(Model as any).sequenceFor = function sequenceFor<M extends Model<boolean>>(
  model: Constructor<M> | M,
  property?: keyof M
): SequenceOptions {
  if (property) throw new UnsupportedError("not currently supported");
  const metadata: SequenceOptions = Model.pkProps(
    model instanceof Model ? (model.constructor as any) : model
  );
  if (!metadata)
    throw new InternalError(
      "No sequence options defined for model. did you use the @pk decorator?"
    );
  return metadata as SequenceOptions;
};

(Model as any).indexes = function indexes<M extends Model>(
  model: M | Constructor<M>
): Record<string, Record<string, IndexMetadata>> {
  const indexDecorators = Metadata.get(
    model instanceof Model ? model.constructor : (model as any),
    PersistenceKeys.INDEX
  );

  return Object.keys(indexDecorators || {}).reduce(
    (acum: Record<string, Record<string, IndexMetadata>>, t: any) => {
      acum[t] = { [PersistenceKeys.INDEX]: indexDecorators[t] };
      return acum;
    },
    {}
  );
};

(Injectables as any).services = function <S extends Service>(): Record<
  string,
  Constructor<S>
> {
  return Metadata["innerGet"](Symbol.for(PersistenceKeys.SERVICE)) as Record<
    string,
    Constructor<S>
  >;
};

(Injectables as any).repositories = function <
  R extends Repository<any, any>,
>(): Record<string, Constructor<R>> {
  return Metadata["innerGet"](Symbol.for(DBKeys.REPOSITORY)) as Record<
    string,
    Constructor<R>
  >;
};
