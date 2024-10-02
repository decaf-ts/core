import {
  DBModel,
  findModelId,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";
import { Observer } from "../interfaces/Observer";
import { ObserverError } from "../repository/errors";
import { Sequence } from "../interfaces/Sequence";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { getColumnName } from "./utils";
import { Observable, RawExecutor } from "../interfaces";

export abstract class Adapter<Y, T = string>
  implements RawExecutor<T>, Observable
{
  private static _current: Adapter<any, any>;
  private static _cache: Record<string, Adapter<any, any>> = {};

  private observers: Observer[] = [];
  private readonly _native: Y;

  get native() {
    return this._native;
  }

  constructor(native: Y, flavour: string) {
    this._native = native;
    Adapter._cache[flavour] = this;
  }

  abstract createIndex(...args: any[]): Promise<any>;

  abstract getSequence<V extends DBModel>(
    model: V,
    sequence: Constructor<Sequence>,
    options?: SequenceOptions,
  ): Promise<Sequence>;

  async prepare<V extends DBModel>(
    model: V,
    pk: string | number,
  ): Promise<{
    record: Record<string, any>;
    id: string;
  }> {
    return {
      record: Object.entries(model).reduce(
        (accum: Record<string, any>, [key, val]) => {
          const mappedProp = getColumnName(model, key);
          accum[mappedProp] = val;
          return accum;
        },
        {},
      ),
      id: (model as Record<string, any>)[pk],
    };
  }

  async revert<V extends DBModel>(
    obj: Record<string, any>,
    clazz: string | Constructor<V>,
    pk: string,
    id: string | number,
  ): Promise<V> {
    const ob: Record<string, any> = {};
    ob[pk] = id;
    const m = (
      typeof clazz === "string" ? Model.build(ob, clazz) : new clazz(ob)
    ) as V;
    return Object.keys(m).reduce((accum: V, key) => {
      if (key === pk) return accum;
      (accum as Record<string, any>)[key] = obj[getColumnName(accum, key)];
      return accum;
    }, m);
  }

  abstract create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract read(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract delete(
    tableName: string,
    id: string | number,
    ...args: any[]
  ): Promise<Record<string, any>>;

  abstract raw<V>(rawInput: T, ...args: any[]): Promise<V>;

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

  static get current() {
    return this._current;
  }

  static get(flavour: any): Adapter<any> | undefined {
    if (flavour in this._cache) return this._cache[flavour];
    throw new InternalError(
      `No Adapter registered under ${flavour}. Did you use the @adapter decorator?`,
    );
  }

  static setCurrent(flavour: string) {
    const adapter = this.get(flavour);
    if (!adapter)
      throw new NotFoundError(`No persistence flavour ${flavour} registered`);
    this._current = adapter;
  }
}
