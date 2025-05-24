import {
  BaseError,
  DBKeys,
  InternalError,
  NotFoundError,
  Context,
  OperationKeys,
  RepositoryFlags,
  DefaultRepositoryFlags,
  Contextual,
} from "@decaf-ts/db-decorators";
import { Observer } from "../interfaces/Observer";
import {
  type Constructor,
  Decoration,
  DefaultFlavour,
  Model,
  ModelConstructor,
  ModelRegistry,
} from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { RawExecutor } from "../interfaces/RawExecutor";
import { Observable } from "../interfaces/Observable";
import { PersistenceKeys } from "./constants";
import { Repository } from "../repository/Repository";
import { Sequence } from "./Sequence";
import { ErrorParser } from "../interfaces";
import { Statement } from "../query/Statement";
import { Logger, Logging } from "@decaf-ts/logging";
import { final } from "../utils";

Decoration.setFlavourResolver((obj: object) => {
  try {
    return (
      Adapter.flavourOf(Model.isModel(obj) ? obj.constructor : (obj as any)) ||
      DefaultFlavour
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    return DefaultFlavour;
  }
});

/**
 * @summary Abstract Decaf-ts Persistence Adapter Class
 * @description Offers the base implementation for all Adapter Classes
 * and manages them various registered {@link Adapter}s
 *
 * @typedef Y the underlying persistence object type or the required config to set it up
 * @typedef Q The query object the adapter uses
 *
 * @param {Y} native the underlying persistence object
 * @param {string} flavour the under witch the persistence adapter should be stored
 *
 * @class Adapter
 * @implements RawExecutor
 * @implements Observable
 */
export abstract class Adapter<
    Y,
    Q,
    F extends RepositoryFlags,
    C extends Context<F>,
  >
  implements RawExecutor<Q>, Contextual<F, C>, Observable, ErrorParser
{
  private static _current: Adapter<any, any, any, any>;
  private static _cache: Record<string, Adapter<any, any, any, any>> = {};

  protected readonly _observers: Observer[] = [];

  private logger!: Logger;

  protected get log() {
    if (!this.logger) this.logger = Logging.for(this as any);
    return this.logger;
  }

  get native() {
    return this._native;
  }

  get alias() {
    return this._alias || this.flavour;
  }

  repository<M extends Model>(): Constructor<
    Repository<M, Q, Adapter<Y, Q, F, C>, F, C>
  > {
    return Repository;
  }

  protected constructor(
    private readonly _native: Y,
    readonly flavour: string,
    private readonly _alias?: string
  ) {
    if (this.flavour in Adapter._cache)
      throw new InternalError(
        `${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} already registered`
      );
    Adapter._cache[this.alias] = this;
    this.log.info(
      `Created ${this.alias} persistence adapter ${this._alias ? `(${this.flavour}) ` : ""} persistence adapter`
    );
    if (!Adapter._current) {
      this.log.verbose(`Defined ${this.alias} persistence adapter as current`);
      Adapter._current = this;
    }
  }

  abstract Statement<M extends Model>(): Statement<Q, M, any>;

  protected isReserved(attr: string) {
    return !attr;
  }

  abstract parseError(err: Error): BaseError;

  abstract initialize(...args: any[]): Promise<void>;

  abstract Sequence(options: SequenceOptions): Promise<Sequence>;

  protected flags<M extends Model>(
    operation: OperationKeys,
    model: Constructor<M>,
    flags: Partial<F>
  ): F {
    return Object.assign({}, DefaultRepositoryFlags, flags, {
      affectedTables: Repository.table(model),
      writeOperation: operation !== OperationKeys.READ,
      timestamp: new Date(),
      operation: operation,
    }) as F;
  }

  protected Context: Constructor<C> = Context<F> as any;

  @final()
  async context<M extends Model>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE,
    overrides: Partial<F>,
    model: Constructor<M>
  ): Promise<C> {
    this.log
      .for(this.context)
      .debug(
        `Creating new context for ${operation} operation on ${model.name} model with flags: ${JSON.stringify(overrides)}`
      );
    return new this.Context(
      this.flags(operation, model, overrides)
    ) as unknown as C;
  }

  prepare<M extends Model>(
    model: M,
    pk: keyof M
  ): {
    record: Record<string, any>;
    id: string;
  } {
    const log = this.log.for(this.prepare);
    log.silly(`Preparing model ${model.constructor.name} before persisting`);
    const result = Object.entries(model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        const mappedProp = Repository.column(model, key);
        if (this.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
    if ((model as any)[PersistenceKeys.METADATA]) {
      log.silly(
        `Passing along persistence metadata for ${(model as any)[PersistenceKeys.METADATA]}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    }

    return {
      record: result,
      id: model[pk] as string,
    };
  }

  revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: keyof M,
    id: string | number | bigint
  ): M {
    const log = this.log.for(this.revert);
    const ob: Record<string, any> = {};
    ob[pk as string] = id;
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as M;
    log.silly(`Rebuilding model ${m.constructor.name} id ${id}`);
    const metadata = obj[PersistenceKeys.METADATA];
    const result = Object.keys(m).reduce((accum: M, key) => {
      if (key === pk) return accum;
      (accum as Record<string, any>)[key] = obj[Repository.column(accum, key)];
      return accum;
    }, m);
    if (metadata) {
      log.silly(
        `Passing along ${this.flavour} persistence metadata for ${m.constructor.name} id ${id}: ${metadata}`
      );
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: metadata,
      });
    }

    return result;
  }

  abstract create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  async createAll(
    tableName: string,
    id: (string | number)[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const log = this.log.for(this.createAll);
    log.verbose(`Creating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(
      id.map((i, count) => this.create(tableName, i, model[count], ...args))
    );
  }

  abstract read(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  async readAll(
    tableName: string,
    id: (string | number | bigint)[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.readAll);
    log.verbose(`Reading ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(id.map((i) => this.read(tableName, i, ...args)));
  }

  abstract update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  async updateAll(
    tableName: string,
    id: string[] | number[],
    model: Record<string, any>[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    if (id.length !== model.length)
      throw new InternalError("Ids and models must have the same length");
    const log = this.log.for(this.updateAll);
    log.verbose(`Updating ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(
      id.map((i, count) => this.update(tableName, i, model[count], ...args))
    );
  }

  abstract delete(
    tableName: string,
    id: string | number | bigint,
    ...args: any[]
  ): Promise<Record<string, any>>;

  async deleteAll(
    tableName: string,
    id: (string | number | bigint)[],
    ...args: any[]
  ): Promise<Record<string, any>[]> {
    const log = this.log.for(this.createAll);
    log.verbose(`Deleting ${id.length} entries ${tableName} table`);
    log.debug(`pks: ${id}`);
    return Promise.all(id.map((i) => this.delete(tableName, i, ...args)));
  }

  abstract raw<R>(rawInput: Q, ...args: any[]): Promise<R>;

  /**
   * @summary Registers an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#observe}
   */
  observe(observer: Observer): void {
    const index = this._observers.indexOf(observer);
    if (index !== -1) throw new InternalError("Observer already registered");
    this.log
      .for(this.observe)
      .verbose(`Registering new observer ${observer.toString()}`);
    this._observers.push(observer);
  }

  /**
   * @summary Unregisters an {@link Observer}
   * @param {Observer} observer
   *
   * @see {Observable#unObserve}
   */
  unObserve(observer: Observer): void {
    const index = this._observers.indexOf(observer);
    if (index === -1) throw new InternalError("Failed to find Observer");
    this.log
      .for(this.unObserve)
      .verbose(`Removing observer ${observer.toString()}`);
    this._observers.splice(index, 1);
  }

  /**
   * @summary calls all registered {@link Observer}s to update themselves
   * @param {any[]} [args] optional arguments to be passed to the {@link Observer#refresh} method
   */
  async updateObservers(...args: any[]): Promise<void> {
    const log = this.log.for(this.updateObservers);
    log.verbose(
      `Updating ${this._observers.length} observers for adapter ${this.alias}`
    );
    const results = await Promise.allSettled(
      this._observers.map((o) => o.refresh(...args))
    );
    results.forEach((result, i) => {
      if (result.status === "rejected")
        log.error(
          `Failed to update observable ${this._observers[i].toString()}: ${result.reason}`
        );
    });
  }

  toString() {
    return `${this.flavour} persistence Adapter`;
  }

  static flavourOf<M extends Model>(model: Constructor<M>): string {
    return (
      Reflect.getMetadata(this.key(PersistenceKeys.ADAPTER), model) ||
      this.current.flavour
    );
  }

  static get current() {
    if (!Adapter._current)
      throw new InternalError(
        `No persistence flavour set. Please initialize your adapter`
      );
    return Adapter._current;
  }

  static get<Y, Q, C extends Context<F>, F extends RepositoryFlags>(
    flavour: any
  ): Adapter<Y, Q, F, C> | undefined {
    if (flavour in this._cache) return this._cache[flavour];
    throw new InternalError(`No Adapter registered under ${flavour}.`);
  }

  static setCurrent(flavour: string) {
    const adapter = Adapter.get(flavour);
    if (!adapter)
      throw new NotFoundError(`No persistence flavour ${flavour} registered`);
    this._current = adapter;
  }

  static key(key: string) {
    return Repository.key(key);
  }

  static models<M extends Model>(flavour: string) {
    try {
      const registry = (Model as any).getRegistry() as ModelRegistry<any>;
      const cache = (
        registry as unknown as { cache: Record<string, ModelConstructor<any>> }
      ).cache;
      const managedModels: ModelConstructor<any>[] = Object.values(cache)
        .map((m: ModelConstructor<M>) => {
          let f = Reflect.getMetadata(
            Adapter.key(PersistenceKeys.ADAPTER),
            m as ModelConstructor<any>
          );
          if (f && f === flavour) return m;
          if (!f) {
            const repo = Reflect.getMetadata(
              Repository.key(DBKeys.REPOSITORY),
              m as ModelConstructor<any>
            );
            if (!repo) return;
            const repository = Repository.forModel(m);

            f = Reflect.getMetadata(
              Adapter.key(PersistenceKeys.ADAPTER),
              repository
            );
            return f;
          }
        })
        .filter((m) => !!m);
      return managedModels;
    } catch (e: any) {
      throw new InternalError(e);
    }
  }
}
