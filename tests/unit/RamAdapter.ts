import { Adapter, ClauseFactory, Statement, Condition } from "../../src";
import { Lock } from "@decaf-ts/transactional-decorators";
import { Sequence, SequenceOptions } from "../../src";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  InternalError,
  NotFoundError,
} from "@decaf-ts/db-decorators";

export class RamAdapter extends Adapter<Record<string, any>, string> {
  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock = new Lock();

  private sequences: Record<string, string | number> = {};

  constructor(flavour: string = "ram") {
    super({}, flavour);
  }

  initialize(args: any): Promise<void> {
    return Promise.resolve(undefined);
  }

  async createIndex(...args: any[]): Promise<any> {
    return Promise.resolve(undefined);
  }

  prepare<V extends Model>(
    model: V,
    pk: string | number
  ): { record: Record<string, any>; id: string } {
    const prepared = super.prepare(model, pk);
    delete prepared.record[pk];
    return prepared;
  }

  revert<V extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<V>,
    pk: string,
    id: string | number
  ): V {
    return super.revert(obj, clazz, pk, id);
  }

  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    args: any
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!this.native[tableName]) this.native[tableName] = {};
    if (id in this.native[tableName])
      throw new ConflictError(
        `Record with id ${id} already exists in table ${tableName}`
      );
    this.native[tableName][id] = model;
    this.lock.release();
    return model;
  }

  async read(
    tableName: string,
    id: string | number,
    args: any
  ): Promise<Record<string, any>> {
    if (!(tableName in this.native))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.native[tableName]))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    return this.native[tableName][id];
  }

  async update(
    tableName: string,
    id: string | number,
    model: Record<string, any>,
    args: any
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!(tableName in this.native))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.native[tableName]))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    this.native[tableName][id] = model;
    this.lock.release();
    return model;
  }

  async delete(
    tableName: string,
    id: string | number,
    args: any
  ): Promise<Record<string, any>> {
    await this.lock.acquire();
    if (!(tableName in this.native))
      throw new NotFoundError(`Table ${tableName} not found`);
    if (!(id in this.native[tableName]))
      throw new NotFoundError(
        `Record with id ${id} not found in table ${tableName}`
      );
    const natived = this.native[tableName][id];
    delete this.native[tableName][id];
    this.lock.release();
    return natived;
  }

  async raw<Z>(rawInput: string): Promise<Z> {
    return Promise.resolve(undefined) as Z;
  }

  async getSequence<V>(
    model: V,
    sequence: Constructor<Sequence>,
    options: SequenceOptions | undefined
  ): Promise<Sequence> {
    return undefined as unknown as Sequence;
  }

  protected parseError<V extends BaseError>(err: Error): V {
    return new InternalError(err) as V;
  }

  get Clauses(): ClauseFactory<Record<string, any>, string> {
    throw new InternalError(`Not implemented`);
  }

  get Statement(): Statement<string> {
    throw new InternalError(`Not implemented`);
  }

  Sequence(options: SequenceOptions): Promise<Sequence> {
    throw new InternalError(`Not implemented`);
  }

  parseCondition(condition: Condition): string {
    throw new InternalError(`Not implemented`);
  }
}
