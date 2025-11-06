import { Model } from "@decaf-ts/decorator-validation";
import type { Executor, RawExecutor } from "../interfaces";
import type {
  FromSelector,
  GroupBySelector,
  OrderBySelector,
  SelectSelector,
} from "./selectors";
import { Condition } from "./Condition";
import { InternalError } from "@decaf-ts/db-decorators";
import { final } from "../utils/decorators";
import type {
  CountOption,
  DistinctOption,
  LimitOption,
  MaxOption,
  MinOption,
  OffsetOption,
  OrderAndGroupOption,
  SelectOption,
  WhereOption,
} from "./options";
import { Paginatable } from "../interfaces/Paginatable";
import { Paginator } from "./Paginator";
import { Adapter } from "../persistence";
import { QueryError } from "./errors";
import { Logger } from "@decaf-ts/logging";
import { LoggedClass } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";

/**
 * @description Base class for database query statements
 * @summary Provides a foundation for building and executing database queries
 *
 * This abstract class implements the query builder pattern for constructing
 * database queries. It supports various query operations like select, from,
 * where, orderBy, groupBy, limit, and offset. It also provides methods for
 * executing queries and handling pagination.
 *
 * @template Q - The query type specific to the database adapter
 * @template M - The model type this statement operates on
 * @template R - The return type of the query
 * @param {Adapter<any, Q, any, any>} adapter - The database adapter to use for executing queries
 * @class Statement
 * @example
 * // Create a statement to query users
 * const statement = new SQLStatement(adapter);
 * const users = await statement
 *   .select()
 *   .from(User)
 *   .where(Condition.attribute("status").eq("active"))
 *   .orderBy(["createdAt", "DESC"])
 *   .limit(10)
 *   .execute();
 *
 * // Use pagination
 * const paginator = await statement
 *   .select()
 *   .from(User)
 *   .paginate(20); // 20 users per page
 *
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Statement
 *   participant Adapter
 *   participant Database
 *
 *   Client->>Statement: select()
 *   Client->>Statement: from(Model)
 *   Client->>Statement: where(condition)
 *   Client->>Statement: orderBy([field, direction])
 *   Client->>Statement: limit(value)
 *   Client->>Statement: execute()
 *   Statement->>Statement: build()
 *   Statement->>Adapter: raw(query)
 *   Adapter->>Database: execute query
 *   Database-->>Adapter: return results
 *   Adapter-->>Statement: return processed results
 *   Statement-->>Client: return final results
 */
export abstract class Statement<Q, M extends Model, R>
  extends LoggedClass
  implements Executor<R>, RawExecutor<Q>, Paginatable<M, R, Q>
{
  protected readonly selectSelector?: SelectSelector<M>[];
  protected distinctSelector?: SelectSelector<M>;
  protected maxSelector?: SelectSelector<M>;
  protected minSelector?: SelectSelector<M>;
  protected countSelector?: SelectSelector<M>;
  protected fromSelector!: Constructor<M>;
  protected whereCondition?: Condition<M>;
  protected orderBySelector?: OrderBySelector<M>;
  protected groupBySelector?: GroupBySelector<M>;
  protected limitSelector?: number;
  protected offsetSelector?: number;

  protected constructor(protected adapter: Adapter<any, any, Q, any, any>) {
    super();
  }

  protected override get log(): Logger {
    return (this.adapter as any).log.for(Statement);
  }

  select<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    S extends readonly SelectSelector<M>[],
  >(): SelectOption<M, M[]>;
  select<S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): SelectOption<M, Pick<M, S[number]>[]>;

  @final()
  select<S extends readonly SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): SelectOption<M, M[]> | SelectOption<M, Pick<M, S[number]>[]> {
    Object.defineProperty(this, "selectSelector", {
      value: selector,
      writable: false,
    });
    return this as SelectOption<M, M[]> | SelectOption<M, Pick<M, S[number]>[]>;
  }

  @final()
  distinct<S extends SelectSelector<M>>(
    selector: S
  ): DistinctOption<M, M[S][]> {
    this.distinctSelector = selector;
    return this as DistinctOption<M, M[S][]>;
  }

  @final()
  max<S extends SelectSelector<M>>(selector: S): MaxOption<M, M[S]> {
    this.maxSelector = selector;
    return this as MaxOption<M, M[S]>;
  }

  @final()
  min<S extends SelectSelector<M>>(selector: S): MinOption<M, M[S]> {
    this.minSelector = selector;
    return this as MinOption<M, M[S]>;
  }

  @final()
  count<S extends SelectSelector<M>>(selector?: S): CountOption<M, number> {
    this.countSelector = selector;
    return this as CountOption<M, number>;
  }

  @final()
  public from(selector: FromSelector<M>): WhereOption<M, R> {
    this.fromSelector = (
      typeof selector === "string" ? Model.get(selector) : selector
    ) as Constructor<M>;
    if (!this.fromSelector)
      throw new QueryError(`Could not find selector model: ${selector}`);
    return this;
  }

  @final()
  public where(condition: Condition<M>): OrderAndGroupOption<M, R> {
    this.whereCondition = condition;
    return this;
  }

  @final()
  public orderBy(
    selector: OrderBySelector<M>
  ): LimitOption<M, R> & OffsetOption<R> {
    this.orderBySelector = selector;
    return this;
  }

  @final()
  public groupBy(selector: GroupBySelector<M>): LimitOption<M, R> {
    this.groupBySelector = selector;
    return this;
  }

  @final()
  public limit(value: number): OffsetOption<R> {
    this.limitSelector = value;
    return this;
  }

  @final()
  public offset(value: number): Executor<R> {
    this.offsetSelector = value;
    return this;
  }

  @final()
  async execute(): Promise<R> {
    try {
      const query: Q = this.build();
      return (await this.raw(query)) as R;
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    }
  }

  async raw<R>(rawInput: Q): Promise<R> {
    const results = await this.adapter.raw<R>(rawInput);
    if (!this.selectSelector) return results;
    const pkAttr = Model.pk(new (this.fromSelector as Constructor<M>)());

    const processor = function recordProcessor(
      this: Statement<Q, M, R>,
      r: any
    ) {
      const id = r[pkAttr];
      return this.adapter.revert(
        r,
        this.fromSelector as Constructor<any>,
        pkAttr,
        id
      ) as any;
    }.bind(this as any);

    if (Array.isArray(results)) return results.map(processor) as R;
    return processor(results) as R;
  }

  protected abstract build(): Q;
  protected abstract parseCondition(condition: Condition<M>, ...args: any[]): Q;
  abstract paginate(size: number): Promise<Paginator<M, R, Q>>;
}
