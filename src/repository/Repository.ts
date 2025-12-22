import {
  BulkCrudOperationKeys,
  DefaultSeparator,
  enforceDBDecorators,
  InternalError,
  ValidationError,
  IRepository,
  OperationKeys,
  Repository as Rep,
  wrapMethodWithContext,
  reduceErrorsToPrint,
  PrimaryKeyType,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { final, Logger } from "@decaf-ts/logging";
import {
  ContextualizedArgs,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { Adapter } from "../persistence/Adapter";
import { Context } from "../persistence/Context";
import { PersistenceKeys } from "../persistence/constants";
import { ObserverHandler } from "../persistence/ObserverHandler";
import { QueryError } from "../query/errors";
import type { DirectionLimitOffset, QueryOptions } from "../query/types";
import { OrderBySelector, SelectSelector } from "../query/selectors";
import { WhereOption } from "../query/options";
import { Condition } from "../query/Condition";
import { Queriable } from "../interfaces/Queriable";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { OrderDirection } from "./constants";
import type {
  ContextOf,
  EventIds,
  FlagsOf,
  InferredAdapterConfig,
  ObserverFilter,
  PersistenceObservable,
  PersistenceObserver,
} from "../persistence/types";
import type { FlagsOf as ContextualFlagsOf } from "@decaf-ts/db-decorators";
import type { Observer } from "../interfaces/Observer";
import {
  Constructor,
  DecorationKeys,
  DefaultFlavour,
  Metadata,
  uses,
} from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { prepared } from "../query/decorators";
import { PreparedStatementKeys } from "../query/constants";
import { Paginator, SerializedPage } from "../query/index";

/**
 * @description Type alias for Repository class with simplified generic parameters.
 * @summary Provides a more concise way to reference the Repository class with its generic parameters.
 * @template M - The model type that extends Model.
 * @template F - The repository flags type.
 * @template C - The context type.
 * @template Q - The query type.
 * @template A - The adapter type.
 * @typedef Repo
 * @memberOf module:core
 */
export type Repo<M extends Model<boolean>> = Repository<M, any>;

/**
 * @description Core repository implementation for database operations on models on a table by table way.
 * @summary Provides CRUD operations, querying capabilities, and observer pattern implementation for model persistence.
 * @template M - The model type that extends Model.
 * @template Q - The query type used by the adapter.
 * @template A - The adapter type for database operations.
 * @template F - The repository flags type.
 * @template C - The context type for operations.
 * @param {A} [adapter] - Optional adapter instance for database operations.
 * @param {Constructor<M>} [clazz] - Optional constructor for the model class.
 * @param {...any[]} [args] - Additional arguments for repository initialization.
 * @class Repository
 * @example
 * // Creating a repository for User model
 * const userRepo = Repository.forModel(User);
 *
 * // Using the repository for CRUD operations
 * const user = await userRepo.create(new User({ name: 'John' }));
 * const retrievedUser = await userRepo.read(user.id);
 * user.name = 'Jane';
 * await userRepo.update(user);
 * await userRepo.delete(user.id);
 *
 * // Querying with conditions
 * const users = await userRepo
 *   .select()
 *   .where({ name: 'Jane' })
 *   .orderBy('createdAt', OrderDirection.DSC)
 *   .limit(10)
 *   .execute();
 * @mermaid
 * sequenceDiagram
 *   participant C as Client Code
 *   participant R as Repository
 *   participant A as Adapter
 *   participant DB as Database
 *   participant O as Observers
 *
 *   C->>+R: create(model)
 *   R->>R: createPrefix(model)
 *   R->>+A: prepare(model)
 *   A-->>-R: prepared data
 *   R->>+A: create(table, id, record)
 *   A->>+DB: Insert Operation
 *   DB-->>-A: Result
 *   A-->>-R: record
 *   R->>+A: revert(record)
 *   A-->>-R: model instance
 *   R->>R: createSuffix(model)
 *   R->>+O: updateObservers(table, CREATE, id)
 *   O-->>-R: Notification complete
 *   R-->>-C: created model
 */
export class Repository<
    M extends Model<boolean>,
    A extends Adapter<any, any, any, any>,
  >
  extends Rep<M, ContextOf<A>>
  implements
    PersistenceObservable<ContextOf<A>>,
    PersistenceObserver<ContextOf<A>>,
    Queriable<M>,
    IRepository<M, ContextOf<A>>
{
  private static _cache: Record<
    string,
    Constructor<Repo<Model>> | Repo<Model>
  > = {};

  protected observers: Observer[] = [];

  protected observerHandler?: ObserverHandler;

  private readonly _adapter!: A;
  private _tableName!: string;

  protected _overrides: Partial<FlagsOf<ContextOf<A>>> &
    Partial<ContextualFlagsOf<ContextOf<A>>> = {
    allowGenerationOverride: false,
    allowRawStatements: true,
    forcePrepareSimpleQueries: false,
    forcePrepareComplexQueries: false,
  } as any;

  private logger!: Logger;

  /**
   * @description Logger instance for this repository.
   * @summary Provides access to the logger for this repository instance.
   * @return {Logger} The logger instance.
   */
  get log(): Logger {
    if (!this.logger)
      this.logger = (
        this.adapter["log" as keyof typeof this.adapter] as Logger
      ).for(this.toString());
    return this.logger;
  }

  /**
   * @description Adapter for database operations.
   * @summary Provides access to the adapter instance for this repository.
   * @template A - The adapter type.
   * @return {A} The adapter instance.
   * @throws {InternalError} If no adapter is found.
   */
  protected get adapter(): A {
    if (!this._adapter)
      throw new InternalError(
        `No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?`
      );
    return this._adapter;
  }

  /**
   * @description Table name for this repository's model.
   * @summary Gets the database table name associated with this repository's model.
   * @return {string} The table name.
   */
  protected get tableName(): string {
    if (!this._tableName) this._tableName = Model.tableName(this.class);
    return this._tableName;
  }

  /**
   * @description Primary key properties for this repository's model.
   * @summary Gets the sequence options containing primary key information.
   * @return {SequenceOptions} The primary key properties.
   * @deprecated for Model.sequenceFor(class)
   */
  protected override get pkProps(): SequenceOptions {
    return super.pkProps;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(adapter?: A, clazz?: Constructor<M>, ...args: any[]) {
    super(clazz);
    if (adapter) this._adapter = adapter;
    if (clazz) {
      Repository.register(clazz, this, this.adapter.alias);
      if (adapter) {
        const flavour = Metadata.get(clazz, DecorationKeys.FLAVOUR);
        if (flavour === DefaultFlavour) {
          uses(adapter.flavour)(clazz);
        }
      }
    }
    [this.createAll, this.readAll, this.updateAll, this.deleteAll].forEach(
      (m) => {
        const name = m.name;
        wrapMethodWithContext(
          this,
          (this as any)[name + "Prefix"],
          m,
          (this as any)[name + "Suffix"]
        );
      }
    );
  }

  protected logCtx<ARGS extends any[]>(
    args: ARGS,
    method: (...args: any[]) => any
  ): ContextualizedArgs<ContextOf<A>, ARGS> {
    return Adapter.logCtx<ContextOf<A>, ARGS>(args, method as any);
  }

  /**
   * @description Creates a proxy with overridden repository flags.
   * @summary Returns a proxy of this repository with the specified flags overridden.
   * @param {Partial<F>} flags - The flags to override.
   * @return {Repository} A proxy of this repository with overridden flags.
   */
  override(flags: Partial<FlagsOf<ContextOf<A>>>): this {
    return new Proxy(this, {
      get: (target: typeof this, p: string | symbol, receiver: any) => {
        const result = Reflect.get(target, p, receiver);
        if (p !== "_overrides") return result;
        return Object.assign({}, result, flags);
      },
    });
  }

  /**
   * @description Creates a new instance of the Repository class with a specific adapter and arguments.
   *
   * @template A - The type of the adapter.
   * @template Q - The type of the query builder.
   * @template F - The type of the filter.
   * @template C - The type of the context.
   *
   * @param {Partial<InferredAdapterConfig<A>>} conf - adapter configurations to override.
   * @param [args] - Additional arguments to be passed to the new instance.
   *
   * @return A new instance of the Repository class with the specified adapter and arguments.
   */
  for(conf: Partial<InferredAdapterConfig<A>>, ...args: any[]): this {
    return new Proxy(this, {
      get: (target: any, p: string | symbol, receiver: any) => {
        if (p === "adapter") {
          return this.adapter.for(conf, ...args);
        }
        return Reflect.get(target, p, receiver);
      },
    });
  }

  /**
   * @description Creates a new observer handler.
   * @summary Factory method for creating an observer handler instance.
   * @return {ObserverHandler} A new observer handler instance.
   */
  protected ObserverHandler(): ObserverHandler {
    return new ObserverHandler();
  }

  /**
   * @description Prepares a model for creation.
   * @summary Validates the model and prepares it for creation in the database.
   * @template M - The model type.
   * @param {M} model - The model to create.
   * @param {...any[]} args - Additional arguments.
   * @return The prepared model and context arguments.
   * @throws {ValidationError} If the model fails validation.
   */
  protected override async createPrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M, ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    model = new this.class(model);
    if (!ignoreHandlers)
      await enforceDBDecorators<M, Repository<M, A>, any>(
        this,
        contextArgs.context,
        model,
        OperationKeys.CREATE,
        OperationKeys.ON
      );

    if (!ignoreValidate) {
      const errors = await Promise.resolve(
        model.hasErrors(
          ...(contextArgs.context.get("ignoredValidationProperties") || [])
        )
      );
      if (errors) throw new ValidationError(errors.toString());
    }

    return [model, ...contextArgs.args];
  }

  /**
   * @description Creates a model in the database.
   * @summary Persists a model instance to the database.
   * @param {M} model - The model to create.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M>} The created model with updated properties.
   */
  async create(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.create);
    log.debug(
      `Creating new ${this.class.name} in table ${Model.tableName(this.class)}`
    );
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, ctx);
    record = await this.adapter.create(this.class, id, record, ...ctxArgs);
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  /**
   * @description Post-creation hook.
   * @summary Executes after a model is created to perform additional operations.
   * @param {M} model - The created model.
   * @param {C} context - The operation context.
   * @return {Promise<M>} The processed model.
   */
  override async createSuffix(model: M, context: ContextOf<A>): Promise<M> {
    return super.createSuffix(model, context);
  }

  /**
   * @description Creates multiple models in the database.
   * @summary Persists multiple model instances to the database in a batch operation.
   * @param {M[]} models - The models to create.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M[]>} The created models with updated properties.
   */
  override async createAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    if (!models.length) return models;
    const { ctx, log, ctxArgs } = this.logCtx(args, this.createAll);
    log.debug(
      `Creating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const prepared = models.map((m) => this.adapter.prepare(m, ctx));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    records = await this.adapter.createAll(
      this.class,
      ids as PrimaryKeyType[],
      records,
      ...ctxArgs
    );
    return records.map((r, i) =>
      this.adapter.revert(
        r,
        this.class,
        ids[i],
        ctx.get("rebuildWithTransient") ? prepared[i].transient : undefined,
        ctx
      )
    );
  }

  /**
   * @description Prepares multiple models for creation.
   * @summary Validates multiple models and prepares them for creation in the database.
   * @param {M[]} models - The models to create.
   * @param {...any[]} args - Additional arguments.
   * @return The prepared models and context arguments.
   * @throws {ValidationError} If any model fails validation.
   */
  protected override async createAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.CREATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    if (!models.length) return [models, ...contextArgs.args];
    const opts = Model.sequenceFor(models[0]);
    let ids: (string | number | bigint | undefined)[] = [];
    if (opts.type) {
      if (!opts.name) opts.name = Model.sequenceName(models[0], "pk");
      ids = await (
        await this.adapter.Sequence(opts)
      ).range(models.length, ...contextArgs.args);
    } else {
      ids = models.map((m, i) => {
        if (typeof m[this.pk] === "undefined")
          throw new InternalError(
            `Primary key is not defined for model in position ${i}`
          );
        return m[this.pk] as string;
      });
    }

    models = await Promise.all(
      models.map(async (m, i) => {
        m = new this.class(m);
        if (opts.type) {
          m[this.pk] = (
            opts.type !== "String"
              ? ids[i]
              : opts.generated
                ? ids[i]
                : `${m[this.pk]}`.toString()
          ) as M[keyof M];
        }

        if (!ignoreHandlers)
          await enforceDBDecorators<M, Repository<M, A>, any>(
            this,
            contextArgs.context,
            m,
            OperationKeys.CREATE,
            OperationKeys.ON
          );
        return m;
      })
    );

    if (!ignoreValidate) {
      const ignoredProps =
        contextArgs.context.get("ignoredValidationProperties") || [];

      const errors = await Promise.all(
        models.map((m) => Promise.resolve(m.hasErrors(...ignoredProps)))
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...contextArgs.args];
  }

  /**
   * @description Prepares for reading a model by ID.
   * @summary Prepares the context and enforces decorators before reading a model.
   * @param {string} key - The primary key of the model to read.
   * @param {...any[]} args - Additional arguments.
   * @return The key and context arguments.
   */
  protected override async readPrefix(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType, ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const model: M = new this.class();
    model[this.pk] = key as M[keyof M];
    await enforceDBDecorators<M, Repository<M, A>, any>(
      this,
      contextArgs.context,
      model,
      OperationKeys.READ,
      OperationKeys.ON
    );
    return [key, ...contextArgs.args];
  }

  /**
   * @description Reads a model from the database by ID.
   * @summary Retrieves a model instance from the database using its primary key.
   * @param {PrimaryKeyType} id - The primary key of the model to read.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M>} The retrieved model instance.
   */
  async read(
    id: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.read);
    log.debug(
      `reading ${this.class.name} from table ${Model.tableName(this.class)} with pk ${this.pk as string}`
    );

    const m = await this.adapter.read(this.class, id, ...ctxArgs);
    return this.adapter.revert<M>(m, this.class, id, undefined, ctx);
  }

  /**
   * @description Prepares for reading multiple models by IDs.
   * @summary Prepares the context and enforces decorators before reading multiple models.
   * @param {string[]|number[]} keys - The primary keys of the models to read.
   * @param {...any[]} args - Additional arguments.
   * @return The keys and context arguments.
   */
  protected override async readAllPrefix(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.READ,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    await Promise.all(
      keys.map(async (k) => {
        const m = new this.class();
        m[this.pk] = k as M[keyof M];
        return enforceDBDecorators<M, Repository<M, A>, any>(
          this,
          contextArgs.context,
          m,
          OperationKeys.READ,
          OperationKeys.ON
        );
      })
    );
    return [keys, ...contextArgs.args];
  }

  /**
   * @description Reads multiple models from the database by IDs.
   * @summary Retrieves multiple model instances from the database using their primary keys.
   * @param {string[]|number[]} keys - The primary keys of the models to read.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M[]>} The retrieved model instances.
   */
  override async readAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.readAll);
    log.debug(
      `reading ${keys.length} ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const records = await this.adapter.readAll(this.class, keys, ...ctxArgs);
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, keys[i], undefined, ctx)
    );
  }

  /**
   * @description Updates a model in the database.
   * @summary Persists changes to an existing model instance in the database.
   * @param {M} model - The model to update.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M>} The updated model with refreshed properties.
   */
  async update(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctxArgs, log, ctx } = this.logCtx(args, this.update);
    // eslint-disable-next-line prefer-const
    let { record, id, transient } = this.adapter.prepare(model, ctx);
    log.debug(
      `updating ${this.class.name} in table ${Model.tableName(this.class)} with id ${id}`
    );
    record = await this.adapter.update(this.class, id, record, ...ctxArgs);
    return this.adapter.revert<M>(record, this.class, id, transient, ctx);
  }

  /**
   * @description Prepares a model for update.
   * @summary Validates the model and prepares it for update in the database.
   * @param {M} model - The model to update.
   * @param {...any[]} args - Additional arguments.
   * @return The prepared model and context arguments.
   * @throws {InternalError} If the model has no primary key value.
   * @throws {ValidationError} If the model fails validation.
   */
  protected override async updatePrefix(
    model: M,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M, ...args: any[], ContextOf<A>]> {
    const contextArgs = await Context.args(
      OperationKeys.UPDATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    const pk = model[this.pk] as string;
    if (!pk)
      throw new InternalError(
        `No value for the Id is defined under the property ${this.pk as string}`
      );
    const oldModel = await this.read(pk, ...contextArgs.args);
    model = Model.merge(oldModel, model, this.class);
    if (!ignoreHandlers)
      await enforceDBDecorators(
        this,
        contextArgs.context,
        model,
        OperationKeys.UPDATE,
        OperationKeys.ON,
        oldModel
      );

    if (!ignoreValidate) {
      const errors = await Promise.resolve(
        model.hasErrors(
          oldModel,
          ...(contextArgs.context.get("ignoredValidationProperties") || [])
        )
      );
      if (errors) throw new ValidationError(errors.toString());
    }
    return [model, ...contextArgs.args];
  }

  /**
   * @description Updates multiple models in the database.
   * @summary Persists changes to multiple existing model instances in the database in a batch operation.
   * @param {M[]} models - The models to update.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M[]>} The updated models with refreshed properties.
   */
  override async updateAll(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.updateAll);
    log.debug(
      `Updating ${models.length} new ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const records = models.map((m) => this.adapter.prepare(m, ctx));
    const updated = await this.adapter.updateAll(
      this.class,
      records.map((r) => r.id),
      records.map((r) => r.record),
      ...ctxArgs
    );
    return updated.map((u, i) =>
      this.adapter.revert(
        u,
        this.class,
        records[i].id,
        ctx.get("rebuildWithTransient") ? records[i].transient : undefined,
        ctx
      )
    );
  }

  /**
   * @description Prepares multiple models for update.
   * @summary Validates multiple models and prepares them for update in the database.
   * @param {M[]} models - The models to update.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<any[]>} The prepared models and context arguments.
   * @throws {InternalError} If any model has no primary key value.
   * @throws {ValidationError} If any model fails validation.
   */
  protected override async updateAllPrefix(
    models: M[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[M[], ...args: any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.UPDATE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const ignoreHandlers = contextArgs.context.get("ignoreHandlers");
    const ignoreValidate = contextArgs.context.get("ignoreValidation");
    const ids = models.map((m) => {
      const id = m[this.pk] as string;
      if (!id) throw new InternalError("missing id on update operation");
      return id;
    });
    const oldModels = await this.readAll(ids, ...contextArgs.args);
    models = models.map((m, i) => {
      m = Model.merge(oldModels[i], m, this.class);
      return m;
    });
    if (!ignoreHandlers)
      await Promise.all(
        models.map((m, i) =>
          enforceDBDecorators<M, Repository<M, A>, any>(
            this,
            contextArgs.context,
            m,
            OperationKeys.UPDATE,
            OperationKeys.ON,
            oldModels[i]
          )
        )
      );

    if (!ignoreValidate) {
      const ignoredProps =
        contextArgs.context.get("ignoredValidationProperties") || [];

      const errors = await Promise.all(
        models.map((m, i) =>
          Promise.resolve(m.hasErrors(oldModels[i], m, ...ignoredProps))
        )
      );

      const errorMessages = reduceErrorsToPrint(errors);

      if (errorMessages) throw new ValidationError(errorMessages);
    }
    return [models, ...contextArgs.args];
  }

  /**
   * @description Prepares for deleting a model by ID.
   * @summary Prepares the context and enforces decorators before deleting a model.
   * @param {any} key - The primary key of the model to delete.
   * @param {...any[]} args - Additional arguments.
   * @return The key and context arguments.
   */
  protected override async deletePrefix(
    key: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType, ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const model = await this.read(key, ...contextArgs.args);
    await enforceDBDecorators<M, Repository<M, A>, any>(
      this,
      contextArgs.context,
      model,
      OperationKeys.DELETE,
      OperationKeys.ON
    );
    return [key, ...contextArgs.args];
  }

  /**
   * @description Deletes a model from the database by ID.
   * @summary Removes a model instance from the database using its primary key.
   * @param {string|number|bigint} id - The primary key of the model to delete.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M>} The deleted model instance.
   */
  async delete(
    id: PrimaryKeyType,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.delete);
    log.debug(
      `deleting new ${this.class.name} in table ${Model.tableName(this.class)} with pk ${id}`
    );

    const m = await this.adapter.delete(this.class, id, ...ctxArgs);
    return this.adapter.revert<M>(m, this.class, id, undefined, ctx);
  }

  /**
   * @description Prepares for deleting multiple models by IDs.
   * @summary Prepares the context and enforces decorators before deleting multiple models.
   * @param {string[]|number[]} keys - The primary keys of the models to delete.
   * @param {...any[]} args - Additional arguments.
   * @return The keys and context arguments.
   */
  protected override async deleteAllPrefix(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<[PrimaryKeyType[], ...any[], ContextOf<A>]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      OperationKeys.DELETE,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const models = await this.readAll(keys, ...contextArgs.args);
    await Promise.all(
      models.map(async (m) => {
        return enforceDBDecorators<M, Repository<M, A>, any>(
          this,
          contextArgs.context,
          m,
          OperationKeys.DELETE,
          OperationKeys.ON
        );
      })
    );
    return [keys, ...contextArgs.args];
  }

  /**
   * @description Deletes multiple models from the database by IDs.
   * @summary Removes multiple model instances from the database using their primary keys.
   * @param {string[]|number[]} keys - The primary keys of the models to delete.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<M[]>} The deleted model instances.
   */
  override async deleteAll(
    keys: PrimaryKeyType[],
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const { ctx, log, ctxArgs } = this.logCtx(args, this.create);
    log.debug(
      `deleting ${keys.length} ${this.class.name} in table ${Model.tableName(this.class)}`
    );

    const results = await this.adapter.deleteAll(this.class, keys, ...ctxArgs);
    return results.map((r, i) =>
      this.adapter.revert(r, this.class, keys[i], undefined, ctx)
    );
  }
  /**
   * @description Creates a select query without specifying fields.
   * @summary Starts building a query that will return all fields of the model.
   * @template S - The array type of select selectors.
   * @return A query builder for the model.
   */
  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<M>[],
  >(): WhereOption<M, M[]>;

  /**
   * @description Creates a select query with specific fields.
   * @summary Starts building a query that will return only the specified fields of the model.
   * @template S - The array type of select selectors.
   * @param selector - The fields to select.
   * @return A query builder for the selected fields.
   */
  select<S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): WhereOption<M, Pick<M, S[number]>[]>;

  /**
   * @description Implementation of the select method.
   * @summary Creates a query builder for the model with optional field selection.
   * @template S - The array type of select selectors.
   * @param [selector] - Optional fields to select.
   * @return A query builder.
   */
  select<S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): WhereOption<M, M[]> | WhereOption<M, Pick<M, S[number]>[]> {
    return this.adapter
      .Statement<M>(this._overrides)
      .select(selector as readonly [...S])
      .from(this.class);
  }

  /**
   * @description Executes a query with the specified conditions and options.
   * @summary Provides a simplified way to query the database with common query parameters.
   * @param {Condition<M>} condition - The condition to filter records.
   * @param orderBy - The field to order results by.
   * @param {OrderDirection} [order=OrderDirection.ASC] - The sort direction.
   * @param {number} [limit] - Optional maximum number of results to return.
   * @param {number} [skip] - Optional number of results to skip.
   * @return {Promise<M[]>} The query results as model instances.
   */
  async query(
    condition: Condition<M>,
    orderBy: keyof M,
    order: OrderDirection = OrderDirection.ASC,
    limit?: number,
    skip?: number,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<M[]> {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PersistenceKeys.QUERY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { ctx } = this.logCtx(contextArgs.args, this.query);
    const sort: OrderBySelector<M> = [orderBy, order as OrderDirection];
    const query = this.select().where(condition).orderBy(sort);
    if (limit) query.limit(limit);
    if (skip) query.offset(skip);
    return query.execute(ctx);
  }

  @prepared()
  async listBy(
    key: keyof M,
    order: OrderDirection,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.LIST_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.listBy);
    log.verbose(
      `listing ${Model.tableName(this.class)} by ${key as string} ${order}`
    );
    return this.select()
      .orderBy([key, order])
      .execute(...ctxArgs);
  }

  @prepared()
  async paginateBy(
    key: keyof M,
    order: OrderDirection,
    ref: Omit<DirectionLimitOffset, "direction"> = {
      offset: 1,
      limit: 10,
    },
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<SerializedPage<M>> {
    // eslint-disable-next-line prefer-const
    let { offset, bookmark, limit } = ref;
    if (!offset && !bookmark)
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.PAGE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.paginateBy);
    log.verbose(
      `paginating ${Model.tableName(this.class)} with page size ${limit}`
    );

    let paginator: Paginator<M>;
    if (bookmark) {
      paginator = await this.override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
        .select()
        .where(this.attr(Model.pk(this.class)).gt(bookmark))
        .orderBy([key, order])
        .paginate(limit as number, ...ctxArgs);
      offset = 1;
    } else if (offset) {
      paginator = await this.override({
        forcePrepareComplexQueries: false,
        forcePrepareSimpleQueries: false,
      } as any)
        .select()
        .orderBy([key, order])
        .paginate(limit as number, ...ctxArgs);
    } else {
      throw new QueryError(`PaginateBy needs a page or a bookmark`);
    }
    const paged = await paginator.page(offset);
    return paginator.serialize(paged) as SerializedPage<M>;
  }

  @prepared()
  async findOneBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.FIND_ONE_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findOneBy);
    log.verbose(
      `finding ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    const result = await this.select()
      .where(this.attr(key).eq(value))
      .limit(1)
      .execute(...ctxArgs);
    if (!result.length) throw new NotFoundError(`No results found`);
    return result[0];
  }

  @prepared()
  async findBy(
    key: keyof M,
    value: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PreparedStatementKeys.FIND_BY,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.findBy);
    log.verbose(
      `finding ${Model.tableName(this.class)} with ${key as string} ${value}`
    );
    return this.select()
      .where(this.attr(key).eq(value))
      .execute(...ctxArgs);
  }

  async statement(name: string, ...args: MaybeContextualArg<ContextOf<A>>) {
    if (!Repository.statements(this, name as keyof typeof this))
      throw new QueryError(`Invalid prepared statement requested ${name}`);
    const contextArgs = await Context.args<M, ContextOf<A>>(
      PersistenceKeys.STATEMENT,
      this.class,
      args,
      this.adapter,
      this._overrides || {}
    );
    const { log, ctxArgs } = this.logCtx(contextArgs.args, this.statement);
    log.verbose(`Executing prepared statement ${name}`);
    return (this as any)[name](...ctxArgs);
  }

  attr(prop: keyof M) {
    return Condition.attr<M>(prop);
  }

  /**
   * @description Registers an observer for this repository.
   * @summary Adds an observer that will be notified of changes to models in this repository.
   * @param {Observer} observer - The observer to register.
   * @param {ObserverFilter} [filter] - Optional filter to limit which events the observer receives.
   * @return {void}
   * @see {Observable#observe}
   */
  @final()
  observe(observer: Observer, filter?: ObserverFilter): void {
    if (!this.observerHandler)
      Object.defineProperty(this, "observerHandler", {
        value: this.ObserverHandler(),
        writable: false,
      });
    const log = this.log.for(this.observe);
    const tableName = Model.tableName(this.class);
    this.adapter.observe(
      this,
      (
        table: Constructor | string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        event: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        id: EventIds,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ...args: [...any[], ContextOf<any>]
      ) => {
        if (typeof table === "string") return table === tableName;
        return Metadata.constr(table) === Metadata.constr(this.class);
      }
    );
    log.verbose(
      `now observing ${this.adapter} filtering on table === ${tableName}`
    );
    this.observerHandler!.observe(observer, filter);
    log.verbose(`Registered new observer ${observer.toString()}`);
  }

  /**
   * @description Unregisters an observer from this repository.
   * @summary Removes an observer so it will no longer receive notifications of changes.
   * @param {Observer} observer - The observer to unregister.
   * @return {void}
   * @throws {InternalError} If the observer handler is not initialized.
   * @see {Observable#unObserve}
   */
  @final()
  unObserve(observer: Observer): void {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    this.observerHandler.unObserve(observer);
    this.log
      .for(this.unObserve)
      .verbose(`Observer ${observer.toString()} removed`);
    if (!this.observerHandler.count()) {
      this.log.verbose(
        `No more observers registered for ${this.adapter}, unsubscribing`
      );
      this.adapter.unObserve(this);
      this.log.verbose(`No longer observing adapter ${this.adapter.flavour}`);
    }
  }

  /**
   * @description Notifies all observers of an event.
   * @summary Updates all registered observers with information about a database event.
   * @param {string} table - The table name where the event occurred.
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of event that occurred.
   * @param {EventIds} id - The ID or IDs of the affected records.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<void>} A promise that resolves when all observers have been notified.
   * @throws {InternalError} If the observer handler is not initialized.
   */
  async updateObservers(
    table: Constructor<M> | string,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<void> {
    if (!this.observerHandler)
      throw new InternalError(
        "ObserverHandler not initialized. Did you register any observables?"
      );
    const { log, ctxArgs } = this.logCtx(args, this.updateObservers);
    log.verbose(
      `Updating ${this.observerHandler.count()} observers for ${this}`
    );
    await this.observerHandler.updateObservers(
      table,
      event,
      Array.isArray(id)
        ? id.map(
            (i) =>
              (Adapter["_baseSequence"] as any).parseValue(
                Model.sequenceFor(this.class).type,
                i
              ) as string
          )
        : ((Adapter["_baseSequence"] as any).parseValue(
            Model.sequenceFor(this.class).type,
            id
          ) as string),
      ...ctxArgs
    );
  }

  /**
   * @description Alias for updateObservers.
   * @summary Notifies all observers of an event (alias for updateObservers).
   * @param {string} table - The table name where the event occurred.
   * @param {OperationKeys|BulkCrudOperationKeys|string} event - The type of event that occurred.
   * @param {EventIds} id - The ID or IDs of the affected records.
   * @param {...any[]} args - Additional arguments.
   * @return {Promise<void>} A promise that resolves when all observers have been notified.
   */
  async refresh(
    table: Constructor<M>,
    event: OperationKeys | BulkCrudOperationKeys | string,
    id: EventIds,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<void> {
    return this.updateObservers(table, event, id, ...args);
  }

  /**
   * @description Creates or retrieves a repository for a model.
   * @summary Factory method that returns a repository instance for the specified model.
   * @template M - The model type that extends Model.
   * @template R - The repository type that extends Repo<M>.
   * @param {Constructor<M>} model - The model constructor.
   * @param {string} [alias] - Optional default adapter flavour if not specified on the model.
   * @param {...any[]} [args] - Additional arguments to pass to the repository constructor.
   * @return {R} A repository instance for the model.
   * @throws {InternalError} If no adapter is registered for the flavour.
   */
  static forModel<M extends Model, R extends Repo<M>>(
    model: Constructor<M>,
    alias?: string,
    ...args: any[]
  ): R {
    let repo: R | Constructor<R> | undefined;

    const _alias: string | undefined =
      alias || Metadata.flavourOf(model) || Adapter.currentFlavour;
    try {
      repo = this.get(model, _alias) as Constructor<R> | R;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      repo = undefined;
    }

    if (repo instanceof Repository) return repo as R;

    const flavour: string | undefined =
      alias ||
      Metadata.flavourOf(model) ||
      (repo && Metadata.get(repo, PersistenceKeys.ADAPTER)) ||
      Adapter.currentFlavour;
    const adapter: Adapter<any, any, any, any> | undefined = flavour
      ? Adapter.get(flavour)
      : undefined;

    if (!adapter)
      throw new InternalError(
        `No registered persistence adapter found flavour ${flavour}`
      );

    repo = repo || (adapter.repository() as Constructor<R>);
    return new repo(adapter, model, ...args) as R;
  }

  /**
   * @description Retrieves a repository for a model from the cache.
   * @summary Gets a repository constructor or instance for the specified model from the internal cache.
   * @template M - The model type that extends Model.
   * @param {Constructor<M>} model - The model constructor.
   * @param {string} [alias] - The adapter alias.
   * @return {Constructor<Repo<M>> | Repo<M>} The repository constructor or instance.
   * @throws {InternalError} If no repository is registered for the model.
   */
  private static get<M extends Model>(
    model: Constructor<M>,
    alias?: string
  ): Constructor<Repo<M>> | Repo<M> {
    const name: string = Model.tableName(model);
    let registryName: string = name;
    if (alias) {
      registryName = [name, alias].join(DefaultSeparator);
    }
    if (registryName in this._cache)
      return this._cache[registryName] as unknown as
        | Constructor<Repo<M>>
        | Repo<M>;
    if (name in this._cache)
      return this._cache[name] as unknown as Constructor<Repo<M>> | Repo<M>;
    throw new InternalError(
      `Could not find repository registered under ${name}`
    );
  }

  /**
   * @description Registers a repository for a model.
   * @summary Associates a repository constructor or instance with a model in the internal cache.
   * @template M - The model type that extends Model.
   * @param {Constructor<M>} model - The model constructor.
   * @param {Constructor<Repo<M>> | Repo<M>} repo - The repository constructor or instance.
   * @param {string} [alias] the adapter alias/flavour.
   * @throws {InternalError} If a repository is already registered for the model.
   */
  static register<M extends Model>(
    model: Constructor<M>,
    repo: Constructor<Repo<M>> | Repo<M>,
    alias?: string
  ) {
    let name = Model.tableName(model);
    if (alias) {
      name = [name, alias].join(DefaultSeparator);
    }
    if (name in this._cache) {
      if (this._cache[name] instanceof Repository)
        throw new InternalError(`${name} already has a registered instance`);
    }
    this._cache[name] = repo as any;
  }

  static statements<R extends Repository<any, any>, K extends keyof R>(
    repo: Constructor<R> | R,
    method?: K
  ): undefined | (K extends keyof R ? boolean : (keyof R)[]) {
    const contr: Constructor<R> =
      repo instanceof Repository ? (repo.constructor as Constructor<R>) : repo;
    const meta = Metadata.get(
      contr,
      method
        ? Metadata.key(PersistenceKeys.STATEMENT, method as string)
        : PersistenceKeys.STATEMENT
    );
    return (method ? meta : Object.keys(meta)) || false;
  }

  static queries<R extends Repository<any, any>, K extends keyof R>(
    repo: Constructor<R> | R,
    method?: K
  ):
    | undefined
    | (K extends keyof R ? QueryOptions : Record<keyof R, QueryOptions>) {
    const contr: Constructor<R> =
      repo instanceof Repository ? (repo.constructor as Constructor<R>) : repo;
    return Metadata.get(
      contr,
      method
        ? Metadata.key(PersistenceKeys.QUERY, method as string)
        : PersistenceKeys.QUERY
    );
  }
}

if (Adapter) Adapter["_baseRepository"] = Repository;
