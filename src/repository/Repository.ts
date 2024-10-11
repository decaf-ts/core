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

export class Repository<T extends DBModel, V = any>
  extends Rep<T>
  implements Observable
{
  private observers: Observer[] = [];

  private readonly _adapter!: Adapter<any, V>;
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

  constructor(adapter?: Adapter<any, V>, clazz?: Constructor<T>) {
    super(clazz);
    if (adapter) this._adapter = adapter;
  }

  async create(model: T, ...args: any[]): Promise<T> {
    // eslint-disable-next-line prefer-const
    let { record, id } = await this.adapter.prepare(model, this.pk);
    record = await this.adapter.create(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  async read(id: string, ...args: any[]): Promise<T> {
    const m = await this.adapter.read(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
  }

  async update(model: T, ...args: any[]): Promise<T> {
    // eslint-disable-next-line prefer-const
    let { record, id } = await this.adapter.prepare(model, this.pk);
    record = await this.adapter.update(this.tableName, id, record, ...args);
    return this.adapter.revert(record, this.class, this.pk, id);
  }

  protected async updatePrefix(
    model: T,
    ...args: any[]
  ): Promise<[T, ...args: any[]]> {
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
        configurable: false,
        writable: false,
        value: (oldModel as any)[PersistenceKeys.METADATA],
      });
    return [model, ...args];
  }

  async delete(id: string, ...args: any[]): Promise<T> {
    const m = await this.adapter.delete(this.tableName, id, ...args);
    return this.adapter.revert(m, this.class, this.pk, id);
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

  static forModel<T extends DBModel>(model: Constructor<T>): Repository<T> {
    const repository = Reflect.getMetadata(
      getDBKey(DBKeys.REPOSITORY),
      model.constructor,
    );
    if (!repository)
      throw new InternalError(
        `No registered repository found for model ${model.constructor.name}`,
      );
    const flavour = Reflect.getMetadata(
      getPersistenceKey(PersistenceKeys.ADAPTER),
      repository.constructor,
    );
    if (!flavour)
      throw new InternalError(
        `No registered persistence adapter found for model ${model.constructor.name}`,
      );
    const adapter = Adapter.get(flavour);
    if (!adapter)
      throw new InternalError(
        `No registered persistence adapter found flavour ${flavour}`,
      );

    let repo: Repository<T>;
    try {
      repo = repository(adapter);
    } catch (e: any) {
      throw new InternalError(
        `Failed to boot repository for ${model.constructor.name} using persistence adapter ${flavour}`,
      );
    }
    return repo;
  }
}
