import { Lock } from "@decaf-ts/transactional-decorators";
import {
  Adapter,
  ClauseFactory,
  Condition,
  GroupOperator,
  Operator,
  Paginator,
  PersistenceKeys,
  QueryError,
  RelationsMetadata,
  Repo,
  Repository,
  Sequence,
  SequenceOptions,
  UnsupportedError,
  User,
} from "../index";
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
import { Context } from "@decaf-ts/db-decorators";
import { RamFlags, RamQuery, RamStorage } from "./types";
import { RamStatement } from "./RamStatement";
import { RamClauseFactory } from "./RamClauseFactory";
import { RamSequence } from "./RamSequence";
import * as crypto from "node:crypto";
import { RamContext } from "./RamContext";

export async function createdByOnRamCreateUpdate<
  M extends Model,
  R extends Repo<M, C, F>,
  V extends RelationsMetadata,
  F extends RamFlags,
  C extends Context<F>,
>(
  this: R,
  context: Context<F>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  const uuid: string = context.get("UUID");
  if (!uuid)
    throw new UnsupportedError(
      "This adapter does not support user identification"
    );
  model[key] = uuid as M[keyof M];
}

const createdByKey = Repository.key(PersistenceKeys.CREATED_BY);
const updatedByKey = Repository.key(PersistenceKeys.UPDATED_BY);

Decoration.flavouredAs("ram")
  .for(createdByKey)
  .define(onCreate(createdByOnRamCreateUpdate), propMetadata(createdByKey, {}))
  .apply();

Decoration.flavouredAs("ram")
  .for(updatedByKey)
  .define(onCreate(createdByOnRamCreateUpdate), propMetadata(updatedByKey, {}))
  .apply();

export class RamAdapter extends Adapter<
  RamStorage,
  RamQuery<any>,
  RamFlags,
  Context<RamFlags>
> {
  protected factory?: RamClauseFactory;

  constructor(flavour: string = "ram") {
    super({}, flavour);
  }

  async context<M extends Model, C extends RamContext, F extends RamFlags>(
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

  private sequences: Record<string, string | number> = {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async initialize(...args: any[]): Promise<void> {
    return Promise.resolve(undefined);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async index(...models: Record<string, any>[]): Promise<any> {
    return Promise.resolve(undefined);
  }

  async user() {
    return new User({
      id: "admin",
    });
  }

  prepare<M extends Model>(
    model: M,
    pk: keyof M
  ): { record: Record<string, any>; id: string } {
    const prepared = super.prepare(model, pk);
    delete prepared.record[pk as string];
    return prepared;
  }

  revert<M extends Model>(
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async raw<Z>(rawInput: RamQuery<any>, process: boolean): Promise<Z> {
    const { where, sort, limit, skip, from } = rawInput;
    let { select } = rawInput;
    const collection = this.tableFor(from);

    const clazz = typeof from === "string" ? Model.get(from) : from;
    const { id, props } = findPrimaryKey(new clazz());

    function parseId(id: any) {
      let result = id;
      switch (props.type) {
        case "Number":
          result = parseInt(result);
          if (isNaN(result)) throw new Error(`Invalid id ${id}`);
          break;
        case "BigInt":
          result = BigInt(parseInt(result));
          break;
        case "String":
          break;
        default:
          throw new InternalError(
            `Invalid id type ${props.type}. should be impossible`
          );
      }
      return result;
    }

    let result: any[] = Object.entries(collection).map(([pk, r]) =>
      this.revert(r, clazz, id as any, parseId(pk))
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

    return result as unknown as Z;
  }

  async paginate<Z>(rawInput: string): Promise<Paginator<Z, string>> {
    return new (class extends Paginator<Z, string> {
      constructor(size: number) {
        super(undefined as unknown as any, size, rawInput);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      protected prepare(rawStatement: string): string {
        throw new Error("Method not implemented.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      page(page: number): Promise<Z[]> {
        throw new Error("Method not implemented.");
      }
    })(10);
  }

  parseError<V extends BaseError>(err: Error): V {
    if (err instanceof BaseError) return err as V;
    return new InternalError(err) as V;
  }

  get Clauses(): ClauseFactory<RamStorage, RamQuery<any>, typeof this> {
    if (!this.factory) this.factory = new RamClauseFactory(this);
    return this.factory as any;
  }

  get Statement(): RamStatement<any> {
    return new RamStatement(this);
  }

  async Sequence(options: SequenceOptions): Promise<Sequence> {
    return new RamSequence(options, this);
  }

  parseCondition(condition: Condition): RamQuery<any> {
    return {
      where: (m: Model) => {
        const { attr1, operator, comparison } = condition as unknown as {
          attr1: string | Condition;
          operator: Operator | GroupOperator;
          comparison: any;
        };

        if (
          [GroupOperator.AND, GroupOperator.OR, Operator.NOT].indexOf(
            operator as GroupOperator
          ) === -1
        ) {
          switch (operator) {
            case Operator.BIGGER:
              return m[attr1 as keyof Model] > comparison;
            case Operator.BIGGER_EQ:
              return m[attr1 as keyof Model] >= comparison;
            case Operator.DIFFERENT:
              return m[attr1 as keyof Model] !== comparison;
            case Operator.EQUAL:
              return m[attr1 as keyof Model] === comparison;
            case Operator.REGEXP:
              if (typeof m[attr1 as keyof Model] !== "string")
                throw new QueryError(
                  `Invalid regexp comparison on a non string attribute: ${m[attr1 as keyof Model]}`
                );
              return !!(m[attr1 as keyof Model] as unknown as string).match(
                new RegExp(comparison, "g")
              );
            case Operator.SMALLER:
              return m[attr1 as keyof Model] < comparison;
            case Operator.SMALLER_EQ:
              return m[attr1 as keyof Model] <= comparison;
            default:
              throw new InternalError(
                `Invalid operator for standard comparisons: ${operator}`
              );
          }
        } else if (operator === Operator.NOT) {
          throw new InternalError("Not implemented");
        } else {
          const op1: RamQuery<any> = this.parseCondition(attr1 as Condition);
          const op2: RamQuery<any> = this.parseCondition(
            comparison as Condition
          );
          switch (operator) {
            case GroupOperator.AND:
              return op1.where(m) && op2.where(m);
            case GroupOperator.OR:
              return op1.where(m) || op2.where(m);
            default:
              throw new InternalError(
                `Invalid operator for And/Or comparisons: ${operator}`
              );
          }
        }
      },
    } as RamQuery<any>;
  }
}
