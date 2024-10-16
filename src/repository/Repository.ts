import {
  DBKeys,
  DBModel,
  enforceDBDecorators,
  findModelId,
  findPrimaryKey,
  getDBKey,
  InternalError,
  OperationKeys,
  Repository as Rep,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { ObserverError } from "./errors";
import { Observable } from "../interfaces/Observable";
import { Observer } from "../interfaces/Observer";
import { Adapter } from "../persistence/Adapter";
import { Constructor } from "@decaf-ts/decorator-validation";
import { getTableName } from "./utils";
import { getPersistenceKey } from "../persistence/decorators";
import { PersistenceKeys } from "../persistence/constants";
import {
  Condition,
  OrderBySelector,
  Query,
  SelectSelector,
  WhereOption,
} from "../query";
import { OrderDirection } from "./constants";

export class Repository<M extends DBModel, Q = any>
  extends Rep<M>
  implements Observable
{
  private static _cache: Record<string, Constructor<Repository<DBModel, any>>> =
    {};

  private observers: Observer[] = [];

  private readonly _adapter!: Adapter<any, Q>;
  private _tableName!: string;
  private _pk!: string;

  get adapter() {
    if (!this._adapter)
      throw new InternalError(
        `No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?`,
      );
    return this._adapter;
  }

  protected get tableName() {
    if (!this._tableName) this._tableName = getTableName(this.class);
    return this._tableName;
  }

  protected get pk() {
    if (!this._pk) this._pk = findPrimaryKey(new this.class()).id;
    return this._pk;
  }

  constructor(adapter?: Adapter<any, Q>, clazz?: Constructor<M>) {
    super(clazz);
    if (adapter) this._adapter = adapter;
  }

  async create(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = await this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  async read(id: string, ...args: any[]): Promise<M> {
    const m = await this.adapter.read(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  async update(model: M, ...args: any[]): Promise<M> {
    // eslint-disable-next-line prefer-const
    let { record, id } = await this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  protected async updatePrefix(
    model: M,
    ...args: any[]
  ): Promise<[M, ...args: any[]]> {
    model = new this.class(model);
    const pk = findModelId(model);

    const oldModel = await this.read(pk);

    await enforceDBDecorators(
      this,
      model,
      OperationKeys.UPDATE,
      OperationKeys.ON,
      oldModel,
    );

    const errors = model.hasErrors(oldModel);
    if (errors) throw new ValidationError(errors.toString());
    if (
      (oldModel as any)[PersistenceKeys.METADATA] &&
      !(model as any)[PersistenceKeys.METADATA]
    )
      Object.defineProperty(model, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (oldModel as any)[PersistenceKeys.METADATA],
      });
    return [model, ...args];
  }

  async delete(id: string, ...args: any[]): Promise<M> {
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
    skip?: number,
  ): Promise<V[]> {
    const sort: OrderBySelector = [orderBy as string, order as OrderDirection];
    const query = this.select().where(condition).orderBy(sort);
    if (limit) query.limit(limit);
    if (skip) query.offset(skip);
    return query.execute() as Promise<V[]>;
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

  static forModel<M extends DBModel>(
    model: Constructor<M>,
  ): Repository<M, any> {
    const repoName: string | undefined = Reflect.getMetadata(
      getDBKey(DBKeys.REPOSITORY),
      model,
    );
    let flavour: string | undefined = Reflect.getMetadata(
      getPersistenceKey(PersistenceKeys.ADAPTER),
      model,
    );
    let adapter: Adapter<any, any> | undefined = flavour
      ? Adapter.get(flavour)
      : undefined;

    let repoConstructor: Constructor<Repository<M>>;
    if (!repoName) {
      if (!adapter)
        throw new InternalError(
          `Cannot boot a standard repository without an adapter definition. Did you @use on the model ${model.name}`,
        );
      repoConstructor = Repository;
    } else {
      repoConstructor = this.get(repoName);
      flavour =
        flavour ||
        Reflect.getMetadata(
          getPersistenceKey(PersistenceKeys.ADAPTER),
          repoConstructor,
        );
      if (!flavour)
        throw new InternalError(
          `No registered persistence adapter found for model ${model.name}`,
        );

      adapter = Adapter.get(flavour);
    }

    if (!adapter)
      throw new InternalError(
        `No registered persistence adapter found flavour ${flavour}`,
      );

    return new repoConstructor(adapter, model);
  }

  private static get<M extends DBModel>(
    name: string,
  ): Constructor<Repository<M>> {
    if (name in this._cache)
      return this._cache[name] as Constructor<Repository<M>>;
    throw new InternalError(
      `Could not find repository registered under ${name}`,
    );
  }

  static register<M extends DBModel>(
    name: string,
    repo: Constructor<Repository<M, any>>,
  ) {
    if (name in this._cache)
      throw new InternalError(`${name} already registered as a repository`);
    this._cache[name] = repo;
  }
}
