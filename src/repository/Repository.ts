import {
  DBModel,
  InternalError,
  Repository as Rep,
} from "@decaf-ts/db-decorators";
import { ObserverError } from "./errors";
import { Observable } from "../interfaces/Observable";
import { Observer } from "../interfaces/Observer";
import { Adapter } from "../persistence/Adapter";

export abstract class Repository<T extends DBModel>
  extends Rep<T>
  implements Observable
{
  private observers: Observer[] = [];

  private readonly _adapter!: Adapter;

  get adapter() {
    if (!this._adapter)
      throw new InternalError(
        `No adapter found for this repository. did you use the @uses decorator or pass it in the constructor?`,
      );
    return this._adapter;
  }

  protected constructor() {
    super();
  }

  async create(model: T, ...args: any[]): Promise<T> {
    return this.adapter.create<T>(model, ...args);
  }

  async read(key: string, ...args: any[]): Promise<T> {
    return this.adapter.read<T>(key, ...args);
  }

  async update(model: T, ...args: any[]): Promise<T> {
    return this.adapter.update<T>(model, ...args);
  }

  async delete(key: string, ...args: any[]): Promise<T> {
    return this.adapter.delete<T>(key, ...args);
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
}
