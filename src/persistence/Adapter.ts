import { DBModel, InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { Injectables } from "@decaf-ts/injectable-decorators";
import { genAdapterInjectableKey } from "./utils";
import { Observer } from "../interfaces/Observer";
import { ObserverError } from "../repository/errors";
import { IAdapter } from "../interfaces/IAdapter";
import { Sequence } from "../interfaces/Sequence";
import { Constructor } from "@decaf-ts/decorator-validation";
import { SequenceOptions } from "../interfaces/SequenceOptions";

export abstract class Adapter<T = string> implements IAdapter<T> {
  private static _current: Adapter<any>;
  private observers: Observer[] = [];

  abstract createIndex(...args: any[]): Promise<any>;

  abstract getSequence<V extends DBModel>(
    model: V,
    sequence: Constructor<Sequence>,
    options?: SequenceOptions,
  ): Promise<Sequence>;

  abstract create<V>(model: V, ...args: any[]): Promise<V>;

  abstract read<V>(key: string | number, ...args: any[]): Promise<V>;

  abstract update<V>(model: V, ...args: any[]): Promise<V>;

  abstract delete<V>(key: string | number, ...args: any[]): Promise<V>;

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
    const adapter = Injectables.get(
      genAdapterInjectableKey(flavour),
    ) as Adapter<any>;
    if (!adapter)
      throw new InternalError(
        `No Adapter registered under ${flavour}. Did you use the @adapter decorator?`,
      );
    return adapter;
  }

  static setCurrent(flavour: string) {
    const adapter = this.get(flavour);
    if (!adapter)
      throw new NotFoundError(`No persistence flavour ${flavour} registered`);
    this._current = adapter;
  }
}
