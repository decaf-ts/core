import { Lock } from "@decaf-ts/transactional-decorators";
import {
  Adapter,
  ClauseFactory,
  Condition,
  GroupOperator,
  Operator,
  Paginator,
  QueryError,
  Repository,
  Sequence,
  SequenceOptions,
  User,
} from "../index";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import {
  BaseError,
  ConflictError,
  InternalError,
  NotFoundError,
  OperationKeys,
  RepositoryFlags,
} from "@decaf-ts/db-decorators";
import { Context } from "@decaf-ts/db-decorators";
import { Context as Ctx } from "../index";
import { RamQuery, RamStorage } from "./types";
import { RamStatement } from "./RamStatement";
import { RamClauseFactory } from "./RamClauseFactory";
import { RamSequence } from "./RamSequence";

export class RamAdapter extends Adapter<
  RamStorage,
  RamQuery<any>,
  RepositoryFlags,
  Ctx<RepositoryFlags>
> {
  protected factory?: RamClauseFactory;

  constructor(flavour: string = "ram") {
    super({}, flavour);
  }

  async context<
    M extends Model,
    C extends Context<F>,
    F extends RepositoryFlags,
  >(
    operation: any,
    model: Constructor<M>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<C> {
    return new (class extends Ctx<F> {
      constructor(obj: F) {
        super(obj);
      }

      get user(): User {
        return new User({ id: "test" });
      }
    })({
      affectedTables: [model.name],
      writeOperation: operation !== OperationKeys.READ,
      timestamp: new Date(),
      operation: operation,
    } as F) as unknown as C;
  }
  private indexes: Record<
    string,
    Record<string | number, Record<string, any>>
  > = {};

  private lock = new Lock();

  private sequences: Record<string, string | number> = {};

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initialize(args: any): Promise<void> {
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

  prepare<V extends Model>(
    model: V,
    pk: keyof V
  ): { record: Record<string, any>; id: string } {
    const prepared = super.prepare(model, pk);
    delete prepared.record[pk as string];
    return prepared;
  }

  revert<V extends Model>(
    obj: Record<string, any>,
    clazz: string | Constructor<V>,
    pk: keyof V,
    id: string | number
  ): V {
    return super.revert(obj, clazz, pk, id);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async raw<Z>(rawInput: RamQuery<any>, process: boolean): Promise<Z> {
    const { where, sort, limit, skip } = rawInput;
    let { select, from } = rawInput;
    if (typeof from === "string") from = Model.get(from) as Constructor<Model>;
    const collection = Repository.table(from);
    if (!(collection in this.native))
      throw new NotFoundError(`Table ${collection} not found`);

    let result: any[] = this.native[collection].values();

    if (skip) result = result.slice(skip);
    if (limit) result = result.slice(0, limit);

    result = result.filter(where);
    if (sort) result = result.sort(sort);
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

  async getSequence<V>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    model: V,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sequence: Constructor<Sequence>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: SequenceOptions | undefined
  ): Promise<Sequence> {
    return undefined as unknown as Sequence;
  }

  parseError<V extends BaseError>(err: Error): V {
    if (err instanceof BaseError) return err as V;
    return new InternalError(err) as V;
  }

  get Clauses(): ClauseFactory<RamStorage, RamQuery<any>, RamAdapter> {
    if (!this.factory) this.factory = new RamClauseFactory(this);
    return this.factory;
  }

  get Statement(): RamStatement<any> {
    return new RamStatement(this);
  }

  async Sequence(options: SequenceOptions): Promise<RamSequence> {
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
