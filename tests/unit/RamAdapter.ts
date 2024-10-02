import {Adapter} from "../../src";
import { Lock } from "@decaf-ts/transactional-decorators";
import {Sequence, SequenceOptions} from "../../src";
import {Constructor} from "@decaf-ts/decorator-validation";
import {BaseError, ConflictError, DBModel, InternalError, NotFoundError} from "@decaf-ts/db-decorators";


export class RamAdapter extends Adapter<{}, string>{

  private readonly lock: Lock = new Lock();

  private cache: Record<string, Record<string | number, Record<string, any>>> = {};

  private indexes: Record<string, Record<string | number, Record<string, any>>> = {};

  private sequences: Record<string, string | number> = {};

  constructor(flavour: string = "ram") {
    super({}, flavour);
  }

  async createIndex(...args: any[]): Promise<any> {
    return Promise.resolve(undefined);
  }

  async prepare<V extends DBModel>(model: V, pk: string | number): Promise<{ record: Record<string, any>; id: string }> {
    const prepared = await super.prepare(model, pk);
    delete prepared.record[pk]
    return prepared;
  }


  async revert<V extends DBModel>(obj: Record<string, any>, clazz: string | Constructor<V>, pk: string, id: string | number): Promise<V> {
    return super.revert(obj, clazz, pk ,id);
  }

  async create(tableName: string, id : string | number, model: Record<string, any>, args: any): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!this.cache[tableName])
      this.cache[tableName] = {};
    if (id in this.cache[tableName])
      throw new ConflictError(`Record with id ${id} already exists in table ${tableName}`);
    this.cache[tableName][id] = model;
    this.lock.release();
    return model;
  }

  async read(tableName: string, id: string | number, args: any): Promise<Record<string, any>> {
    if (!(tableName in this.cache))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.cache[tableName]))
      throw new NotFoundError(`Record with id ${id} not found in table ${tableName}`);
    return this.cache[tableName][id];
  }

  async update(tableName: string, id : string | number, model: Record<string, any>, args: any): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!(tableName in this.cache))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.cache[tableName]))
      throw new NotFoundError(`Record with id ${id} not found in table ${tableName}`);
    this.cache[tableName][id] = model;
    this.lock.release();
    return model;
  }

  async delete(tableName: string, id: string | number, args: any): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!(tableName in this.cache))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.cache[tableName]))
      throw new NotFoundError(`Record with id ${id} not found in table ${tableName}`);
    const cached =  this.cache[tableName][id];
    delete this.cache[tableName][id];
    this.lock.release();
    return cached;
  }

  async raw<Z>(rawInput: string): Promise<Z> {
    return Promise.resolve(undefined) as Z;
  }

  async getSequence<V>(model: V, sequence: Constructor<Sequence>, options: SequenceOptions | undefined): Promise<Sequence> {
    return undefined as unknown as Sequence;
  }

  protected parseError<V extends BaseError>(err: Error): V {
    return new InternalError(err) as V;
  }
}