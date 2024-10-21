import {
  BaseError,
  InternalError,
  NotFoundError,
  Repository,
} from "@decaf-ts/db-decorators";
import { Observer } from "../interfaces/Observer";
import { ObserverError } from "../repository/errors";
import { Sequence } from "../interfaces/Sequence";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { getColumnName, getModelsByFlavour } from "./utils";
import { RawExecutor } from "../interfaces/RawExecutor";
import { Observable } from "../interfaces/Observable";
import { PersistenceKeys } from "./constants";
import { Query } from "../query/Query";
import { Statement } from "../query/Statement";
import { ClauseFactory } from "../query/ClauseFactory";
import { Condition } from "../query";

/**
 * @summary Abstract Decaf-ts Persistence Adapter Class
 * @description Offers the base implementation for all Adapter Classes
 * and manages them various registered {@link Adapter}s
 *
 * @typedef Y the underlying persistence object type
 * @typedef Q The query object the adapter uses
 *
 * @param {Y} native the underlying persistence object
 * @param {string} flavour the under witch the persistence adapter should be stored
 *
 * @class Adapter
 * @implements RawExecutor
 * @implements Observable
 */
export abstract class Adapter<Y, Q> implements RawExecutor<Q>, Observable {
  private static _current: Adapter<any, any>;
  private static _cache: Record<string, Adapter<any, any>> = {};

  private readonly _observers: Observer[] = [];
  private readonly _native: Y;

  get native() {
    return this._native;
  }

  protected constructor(
    native: Y,
    readonly flavour: string
  ) {
    this._native = native;
    Adapter._cache[flavour] = this;
  }

  Query<M extends Model>(): Query<Q, M> {
    return new Query(this);
  }

  abstract parseCondition(condition: Condition): Q;

  abstract get Statement(): Statement<Q>;

  abstract get Clauses(): ClauseFactory<Y, Q>;

  protected isReserved(attr: string) {
    return !attr;
  }

  protected abstract parseError(err: Error): BaseError;

  abstract initialize(...args: any[]): Promise<void>;

  abstract createIndex<M extends Model>(...models: M[]): Promise<any>;

  abstract Sequence(options: SequenceOptions): Promise<Sequence>;

  prepare<M extends Model>(
    model: M,
    pk: string | number
  ): {
    record: Record<string, any>;
    id: string;
  } {
    const result = Object.entries(model).reduce(
      (accum: Record<string, any>, [key, val]) => {
        if (key === pk) return accum;
        const mappedProp = getColumnName(model, key);
        if (this.isReserved(mappedProp))
          throw new InternalError(`Property name ${mappedProp} is reserved`);
        accum[mappedProp] = val;
        return accum;
      },
      {}
    );
    if ((model as any)[PersistenceKeys.METADATA])
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        writable: false,
        configurable: true,
        value: (model as any)[PersistenceKeys.METADATA],
      });
    return {
      record: result,
      id: (model as Record<string, any>)[pk],
    };
  }

  revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: string,
    id: string | number | bigint
  ): M {
    const ob: Record<string, any> = {};
    ob[pk] = id;
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as M;
    const metadata = obj[PersistenceKeys.METADATA];
    const result = Object.keys(m).reduce((accum: M, key) => {
      if (key === pk) return accum;
      (accum as Record<string, any>)[key] = obj[getColumnName(accum, key)];
      return accum;
    }, m);
    if (metadata)
      Object.defineProperty(result, PersistenceKeys.METADATA, {
        enumerable: false,
        configurable: false,
        writable: false,
        value: metadata,
      });
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
    this._observers.splice(index, 1);
  }

  /**
   * @summary calls all registered {@link Observer}s to update themselves
   * @param {any[]} [args] optional arguments to be passed to the {@link Observer#refresh} method
   */
  async updateObservers(...args: any[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      Promise.all(this._observers.map((o: Observer) => o.refresh(...args)))
        .then(() => {
          resolve();
        })
        .catch((e: any) => reject(new ObserverError(e)));
    });
  }

  static get current() {
    return this._current;
  }

  static get<Y, Q>(flavour: any): Adapter<Y, Q> | undefined {
    if (flavour in this._cache) return this._cache[flavour];
    throw new InternalError(`No Adapter registered under ${flavour}.`);
  }

  static setCurrent(flavour: string) {
    const adapter = this.get(flavour);
    if (!adapter)
      throw new NotFoundError(`No persistence flavour ${flavour} registered`);
    this._current = adapter;
  }

  static key(key: string) {
    return Repository.key(key);
  }

  static models<M extends Model>(flavour: string) {
    return getModelsByFlavour<M>(flavour);
  }
}
