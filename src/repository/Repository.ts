import {
  argsWithContext,
  DBKeys,
  enforceDBDecorators,
  findPrimaryKey,
  InternalError,
  OperationKeys,
  Repository as Rep,
  ValidationError,
  wrapMethodWithContext,
} from "@decaf-ts/db-decorators";
import { ObserverError } from "./errors";
import { Observable } from "../interfaces/Observable";
import { Observer } from "../interfaces/Observer";
import { Adapter } from "../persistence/Adapter";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "../persistence/constants";
import {
  Condition,
  OrderBySelector,
  Query,
  SelectSelector,
  WhereOption,
} from "../query";
import { OrderDirection } from "./constants";
import { SequenceOptions } from "../interfaces";
import { Queriable } from "../interfaces/Queriable";
import { getAllPropertyDecorators } from "@decaf-ts/reflection";
import { IndexMetadata } from "./types";
import { Sequence } from "../persistence/Sequence";

export class Repository<M extends Model, Q = any>
  extends Rep<M>
  implements Observable, Queriable
{
  private static _cache: Record<
    string,
    Constructor<Repository<Model, any>> | Repository<Model, any>
  > = {};

  private observers: Observer[] = [];

  private readonly _adapter!: Adapter<any, Q>;
  private _tableName!: string;

  get adapter() {
    if (!this._adapter)
      throw new InternalError(
        `No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?`
      );
    return this._adapter;
  }

  protected get tableName() {
    if (!this._tableName) this._tableName = Repository.table(this.class);
    return this._tableName;
  }

  constructor(adapter?: Adapter<any, Q>, clazz?: Constructor<M>) {
    super(clazz);
    if (adapter) this._adapter = adapter;
    if (clazz) Repository.register(clazz, this);
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

  async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  async createAll(models: M[], ...args: any[]): Promise<M[]> {
    if (!models.length) return models;
    const prepared = models.map((m) => this.adapter.prepare(m, this.pk));
    const ids = prepared.map((p) => p.id);
    let records = prepared.map((p) => p.record);
    records = await this.adapter.createAll(
      this.tableName,
      ids as (string | number)[],
      records,
      ...args
    );
    return records.map((r, i) =>
      this.adapter.revert(r, this.class, this.pk, ids[i] as string | number)
    );
  }

  protected async createAllPrefix(models: M[], ...args: any[]) {
    const contextArgs = argsWithContext(args);
    if (!models.length) return [models, ...contextArgs.args];
    const opts = Repository.getSequenceOptions(models[0]);
    let ids: (string | number | bigint | undefined)[] = [];
    if (opts.type) {
      if (!opts.name) opts.name = Sequence.pk(models[0]);
      ids = await (await this.adapter.Sequence(opts)).range(models.length);
    }

    models = await Promise.all(
      models.map(async (m, i) => {
        m = new this.class(m);
        (m as Record<string, any>)[this.pk] = ids[i];
        await enforceDBDecorators(
          this,
          contextArgs.context,
          m,
          OperationKeys.CREATE,
          OperationKeys.ON
        );
        return m;
      })
    );
    const errors = models
      .map((m) => m.hasErrors())
      .reduce((accum: string | undefined, e, i) => {
        if (e)
          accum =
            typeof accum === "string"
              ? accum + `\n - ${i}: ${e.toString()}`
              : ` - ${i}: ${e.toString()}`;
        return accum;
      }, undefined);
    if (errors) throw new ValidationError(errors);
    return [models, ...contextArgs.args];
  }

  async read(id: string | number | bigint, ...args: any[]): Promise<M> {
    const m = await this.adapter.read(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  protected async updatePrefix(
    model: M,
    ...args: any[]
  ): Promise<[M, ...args: any[]]> {
    const contextArgs = argsWithContext(args);
    const pk = (model as Record<string, any>)[this.pk];
    if (!pk)
      throw new InternalError(
        `No value for the Id is defined under the property ${this.pk}`
      );
    const oldModel = await this.read(pk, ...contextArgs.args);
    model = this.merge(oldModel, model);
    await enforceDBDecorators(
      this,
      contextArgs.context,
      model,
      OperationKeys.UPDATE,
      OperationKeys.ON,
      oldModel
    );

    const errors = model.hasErrors(oldModel);
    if (errors) throw new ValidationError(errors.toString());
    if (Repository.getMetadata(oldModel)) {
      if (!Repository.getMetadata(model))
        Repository.setMetadata(model, Repository.getMetadata(oldModel));
    }
    return [model, ...contextArgs.args];
  }

  protected async updateAllPrefix(models: M[], ...args: any[]): Promise<any[]> {
    const contextArgs = argsWithContext(args);
    const ids = models.map((m) => {
      const id = (m as Record<string, any>)[this.pk];
      if (!id) throw new InternalError("missing id on update operation");
      return id;
    });
    const oldModels = await this.readAll(ids, ...contextArgs.args);
    models = models.map((m, i) => {
      m = this.merge(oldModels[i], m);
      if (Repository.getMetadata(oldModels[i])) {
        if (!Repository.getMetadata(m))
          Repository.setMetadata(m, Repository.getMetadata(oldModels[i]));
      }
      return m;
    });
    await Promise.all(
      models.map((m, i) =>
        enforceDBDecorators(
          this,
          contextArgs.context,
          m,
          OperationKeys.UPDATE,
          OperationKeys.ON,
          oldModels[i]
        )
      )
    );

    const errors = models
      .map((m, i) => m.hasErrors(oldModels[i], m))
      .reduce((accum: string | undefined, e, i) => {
        if (e)
          accum =
            typeof accum === "string"
              ? accum + `\n - ${i}: ${e.toString()}`
              : ` - ${i}: ${e.toString()}`;
        return accum;
      }, undefined);
    if (errors) throw new ValidationError(errors);

    return [models, ...contextArgs.args];
  }

  async delete(id: string | number | bigint, ...args: any[]): Promise<M> {
    const m = await this.adapter.delete(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  select(selector?: SelectSelector): WhereOption {
    return new Query<Q, M>(this.adapter).select(selector).from(this.class);
  }

  async query<V>(
    condition: Condition,
    orderBy: string,
    order: OrderDirection = OrderDirection.ASC,
    limit?: number,
    skip?: number
  ): Promise<V> {
    const sort: OrderBySelector = [orderBy as string, order as OrderDirection];
    const query = this.select().where(condition).orderBy(sort);
    if (limit) query.limit(limit);
    if (skip) query.offset(skip);
    return query.execute<V>();
  }

  async timestamp() {
    return this.adapter.timestamp();
  }

  /**
   * @summary Registers an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#observe}
   */
  observe(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.observers.push(observer);
  }

  /**
   * @summary Unregisters an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#unObserve}
   */
  unObserve(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.observers.splice(index, 1);
  }

  /**
   * @summary calls all registered {@link Observer}s to update themselves
   * @param {any[]} [args] optional arguments to be passed to the {@link Observer#refresh} method
   */
  async updateObservers(...args: any[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Promise.all(this.observers.map((o: Observer) => o.refresh(...args)))
        .then(() => {
          resolve();
        })
        .catch((e: any) => reject(new ObserverError(e)));
    });
  }

  static forModel<M extends Model, R extends Repository<M, any>>(
    model: Constructor<M>
  ): R {
    let repo: Repository<M> | Constructor<Repository<M>>;
    try {
      repo = this.get(model);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      repo = Repository;
    }

    if (repo instanceof Repository) return repo as R;

    const flavour: string | undefined =
      Reflect.getMetadata(Adapter.key(PersistenceKeys.ADAPTER), model) ||
      Reflect.getMetadata(Adapter.key(PersistenceKeys.ADAPTER), repo);
    const adapter: Adapter<any, any> | undefined = flavour
      ? Adapter.get(flavour)
      : undefined;

    if (!adapter)
      throw new InternalError(
        `No registered persistence adapter found flavour ${flavour}`
      );

    return new repo(adapter, model) as R;
  }

  private static get<M extends Model>(
    model: Constructor<M>
  ): Constructor<Repository<M>> | Repository<M> {
    const name = this.table(model);
    if (name in this._cache)
      return this._cache[name] as Constructor<Repository<M>> | Repository<M>;
    throw new InternalError(
      `Could not find repository registered under ${name}`
    );
  }

  static register<M extends Model>(
    model: Constructor<M>,
    repo: Constructor<Repository<M, any>> | Repository<M, any>
  ) {
    const name = this.table(model);
    if (name in this._cache)
      throw new InternalError(`${name} already registered as a repository`);
    this._cache[name] = repo;
  }

  static setMetadata<M extends Model>(model: M, metadata: any) {
    Object.defineProperty(model, PersistenceKeys.METADATA, {
      enumerable: false,
      configurable: true,
      writable: false,
      value: metadata,
    });
  }

  static getMetadata<M extends Model>(model: M) {
    const descriptor = Object.getOwnPropertyDescriptor(
      model,
      PersistenceKeys.METADATA
    );
    return descriptor ? descriptor.value : undefined;
  }

  static removeMetadata<M extends Model>(model: M) {
    const descriptor = Object.getOwnPropertyDescriptor(
      model,
      PersistenceKeys.METADATA
    );
    if (descriptor) delete (model as any)[PersistenceKeys.METADATA];
  }

  static getSequenceOptions<M extends Model>(model: M) {
    const pk = findPrimaryKey(model).id;
    const metadata = Reflect.getMetadata(Repository.key(DBKeys.ID), model, pk);
    if (!metadata)
      throw new InternalError(
        "No sequence options defined for model. did you use the @pk decorator?"
      );
    return metadata as SequenceOptions;
  }

  static indexes<M extends Model>(model: M | Constructor<M>) {
    const indexDecorators = getAllPropertyDecorators(
      model instanceof Model ? model : new model(),
      DBKeys.REFLECT
    );
    return Object.entries(indexDecorators || {}).reduce(
      (accum: Record<string, Record<string, IndexMetadata>>, [k, val]) => {
        const decs = val.filter((v) => v.key.startsWith(PersistenceKeys.INDEX));
        if (decs && decs.length) {
          for (const dec of decs) {
            const { key, props } = dec;
            accum[k] = accum[k] || {};
            accum[k][key] = props as IndexMetadata;
          }
        }
        return accum;
      },
      {}
    );
  }

  static table<M extends Model>(model: M | Constructor<M>) {
    const metadata = Reflect.getMetadata(
      Adapter.key(PersistenceKeys.TABLE),
      model instanceof Model ? model.constructor : model
    );
    if (metadata) {
      return metadata;
    }
    if (model instanceof Model) {
      return model.constructor.name;
    }
    return model.name;
  }

  static column<M extends Model>(model: M, attribute: string) {
    const metadata = Reflect.getMetadata(
      Adapter.key(PersistenceKeys.COLUMN),
      model,
      attribute
    );
    return metadata ? metadata : attribute;
  }
}
