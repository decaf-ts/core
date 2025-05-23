import { Context } from "@decaf-ts/db-decorators";
import { RamFlags, RawRamQuery, RamStorage, RamRepository } from "./types";
import { RamStatement } from "./RamStatement";
import * as crypto from "node:crypto";
import { RamContext } from "./RamContext";
import { Repository } from "../repository/Repository";
import { Adapter, PersistenceKeys, Sequence } from "../persistence";
import { SequenceOptions } from "../interfaces";
import { Lock } from "@decaf-ts/transactional-decorators";
import {
  Constructor,
  Decoration,
  Model,
  propMetadata,
} from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  DefaultRepositoryFlags,
  findPrimaryKey,
  InternalError,
  NotFoundError,
  onCreate,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { RamSequence } from "./RamSequence";
import { createdByOnRamCreateUpdate } from "./handlers";
import { RamFlavour } from "./constants";

export class RamAdapter extends Adapter<
  RamStorage,
  RawRamQuery<any>,
  RamFlags,
  Context<RamFlags>
> {
  constructor(alias: string = RamFlavour) {
    super({}, RamFlavour, alias);
  }

  override repository<M extends Model>(): Constructor<RamRepository<M>> {
    return super.repository<M>() as Constructor<RamRepository<M>>;
  }

  override async context<
    M extends Model,
    C extends RamContext,
    F extends RamFlags,
  >(
    operation: any,
    overrides: Partial<RamFlags>,
    model: Constructor<M>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<C> {
    return new RamContext(
      Object.assign({}, DefaultRepositoryFlags, overrides, {
        affectedTables: [model.name],
        writeOperation: operation !== OperationKeys.READ,
        timestamp: new Date(),
        operation: operation,
        UUID: crypto.randomUUID(),
      }) as F
    ) as C;
  }
  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock = new Lock();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    return Promise.resolve(undefined);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async index(...models: Record<string, any>[]): Promise<any> {
    return Promise.resolve(undefined);
  }

  override prepare<M extends Model>(
    model: M,
    pk: keyof M
  ): { record: Record<string, any>; id: string } {
    const prepared = super.prepare(model, pk);
    delete prepared.record[pk as string];
    return prepared;
  }

  override revert<M extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<M>,
    pk: keyof M,
    id: string | number
  ): M {
    const res = super.revert(obj, clazz, pk, id);
    return res;
  }

  async create(
    tableName: string,
    id: string | number,
    model: Record<string, any>
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
    id: string | number
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
    model: Record<string, any>
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
    id: string | number
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

  protected tableFor<M extends Model>(from: string | Constructor<M>) {
    if (typeof from === "string") from = Model.get(from) as Constructor<M>;
    const table = Repository.table(from);
    if (!(table in this.native)) this.native[table] = {};
    return this.native[table];
  }

  async raw<R>(rawInput: RawRamQuery<any>): Promise<R> {
    const { where, sort, limit, skip, from } = rawInput;
    let { select } = rawInput;
    const collection = this.tableFor(from);
    const { id, props } = findPrimaryKey(new from());

    let result: any[] = Object.entries(collection).map(([pk, r]) =>
      this.revert(
        r,
        from,
        id as any,
        Sequence.parseValue(props.type as any, pk as string) as string
      )
    );

    result = where ? result.filter(where) : result;

    if (sort) result = result.sort(sort);

    if (skip) result = result.slice(skip);
    if (limit) result = result.slice(0, limit);

    if (select) {
      select = Array.isArray(select) ? select : [select];
      result = result.map((r) =>
        Object.entries(r).reduce((acc: Record<string, any>, [key, val]) => {
          if ((select as string[]).includes(key)) acc[key] = val;
          return acc;
        }, {})
      );
    }

    return result as unknown as R;
  }

  parseError<V extends BaseError>(err: Error): V {
    if (err instanceof BaseError) return err as V;
    return new InternalError(err) as V;
  }

  Statement<M extends Model>(): RamStatement<M, any> {
    return new RamStatement<M, any>(this as any);
  }

  async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new RamSequence(options, this);
  }

  static decoration() {
    const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
    const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);
    Decoration.flavouredAs(RamFlavour)
      .for(createdByKey)
      .define(
        onCreate(createdByOnRamCreateUpdate),
        propMetadata(createdByKey, {})
      )
      .apply();
    Decoration.flavouredAs(RamFlavour)
      .for(updatedByKey)
      .define(
        onCreate(createdByOnRamCreateUpdate),
        propMetadata(updatedByKey, {})
      )
      .apply();
  }
}

RamAdapter.decoration();
