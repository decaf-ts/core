import { Model } from "@decaf-ts/decorator-validation";
import type { Executor, RawExecutor } from "../interfaces";
import type {
  FromSelector,
  GroupBySelector,
  OrderBySelector,
  SelectSelector,
} from "./selectors";
import { Condition } from "./Condition";
import { prefixMethod } from "@decaf-ts/db-decorators";
import { final, toCamelCase } from "@decaf-ts/logging";
import type {
  CountOption,
  DistinctOption,
  LimitOption,
  MaxOption,
  MinOption,
  OffsetOption,
  OrderAndGroupOption,
  PreparableStatementExecutor,
  SelectOption,
  StatementExecutor,
  WhereOption,
} from "./options";
import { Paginatable } from "../interfaces/Paginatable";
import { Paginator } from "./Paginator";
import {
  Adapter,
  AdapterFlags,
  type ContextOf,
  PersistenceKeys,
  RawResult,
  UnsupportedError,
} from "../persistence";
import { QueryError } from "./errors";
import { Logger } from "@decaf-ts/logging";
import { Constructor } from "@decaf-ts/decoration";
import {
  type ContextualArgs,
  ContextualLoggedClass,
  type MaybeContextualArg,
} from "../utils/index";
import { Context } from "../persistence/Context";
import { DirectionLimitOffset, PreparedStatement } from "./types";
import { QueryClause } from "./types";
import { GroupOperator, Operator, PreparedStatementKeys } from "./constants";
import { OrderDirection } from "../repository/constants";
import { Repository } from "../repository/Repository";
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
export abstract class Statement<
    M extends Model,
    A extends Adapter<any, any, any, any>,
    R,
    Q = A extends Adapter<any, any, infer Q, any> ? Q : never,
  >
  extends ContextualLoggedClass<ContextOf<A>>
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

  protected prepared?: PreparedStatement<M>;

  protected constructor(
    protected adapter: Adapter<any, any, Q, any>,
    protected overrides?: Partial<AdapterFlags>
  ) {
    super();
    [this.execute, this.paginate].forEach((m) => {
      prefixMethod(
        this,
        m,
        async (...args: MaybeContextualArg<ContextOf<A>>) => {
          let execArgs = args;
          if (
            (!execArgs.length ||
              !(execArgs[execArgs.length - 1] instanceof Context)) &&
            this.fromSelector
          ) {
            const ctx = await this.adapter.context(
              PersistenceKeys.QUERY,
              this.overrides || {},
              this.fromSelector
            );
            execArgs = [...execArgs, ctx];
          }
          const { ctx, ctxArgs } = Adapter.logCtx<ContextOf<A>>(
            execArgs,
            m.name
          );

          const forceSimple = ctx.get("forcePrepareSimpleQueries");
          const forceComplex = ctx.get("forcePrepareComplexQueries");
          if ((forceSimple && this.isSimpleQuery()) || forceComplex)
            await this.prepare(ctx);
          return ctxArgs;
        },
        m.name
      );
    });
  }

  protected isSquashable() {}

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
  ): LimitOption<M, R> & OffsetOption<M, R> {
    this.orderBySelector = selector;
    return this;
  }

  @final()
  public groupBy(selector: GroupBySelector<M>): LimitOption<M, R> {
    this.groupBySelector = selector;
    return this;
  }

  @final()
  public limit(value: number): OffsetOption<M, R> {
    this.limitSelector = value;
    return this;
  }

  @final()
  public offset(value: number): PreparableStatementExecutor<M, R> {
    this.offsetSelector = value;
    return this;
  }

  @final()
  async execute(...args: MaybeContextualArg<ContextOf<A>>): Promise<R> {
    try {
      if (this.prepared) return this.executePrepared(...args);
      const query: Q = this.build();
      return (await this.raw<R>(
        query,
        ...(args as ContextualArgs<ContextOf<A>>)
      )) as unknown as R;
    } catch (e: unknown) {
      throw new QueryError(e as Error);
    }
  }

  protected async executePrepared(
    ...argz: MaybeContextualArg<ContextOf<A>>
  ): Promise<R> {
    const repo = Repository.forModel(this.fromSelector, this.adapter.alias);
    const { method, args, params } = this.prepared as PreparedStatement<any>;
    return repo.statement(
      method,
      // page ? method.replace(regexp, PreparedStatementKeys.PAGE_BY) : method,
      ...args,
      params,
      ...argz
    );
  }

  async raw<R>(rawInput: Q, ...args: ContextualArgs<ContextOf<A>>): Promise<R> {
    const { ctx, ctxArgs } = this.logCtx(args, this.raw);
    const allowRawStatements = ctx.get("allowRawStatements");
    if (!allowRawStatements)
      throw new UnsupportedError(
        "Raw statements are not allowed in the current configuration"
      );
    const results: R = await this.adapter.raw<R, true>(
      rawInput,
      true,
      ...ctxArgs
    );
    if (!this.selectSelector) {
      return results as unknown as R;
    }
    const pkAttr = Model.pk(this.fromSelector);

    const processor = function recordProcessor(
      this: Statement<M, A, R, Q>,
      r: any
    ) {
      const id = r[pkAttr];
      return this.adapter.revert(
        r,
        this.fromSelector as Constructor<any>,
        id,
        undefined,
        ctx
      ) as any;
    }.bind(this as any);

    if (Array.isArray(results)) return results.map(processor) as R;
    return processor(results) as R;
  }

  protected prepareCondition(condition: Condition<any>, ctx: ContextOf<A>) {
    // @ts-expect-error accessing protected properties
    // eslint-disable-next-line prefer-const
    let { attr1, operator, comparison } = condition;

    const result: PreparedStatement<any> = {} as any;
    switch (operator) {
      case GroupOperator.AND:
      case GroupOperator.OR: {
        let side1: string = attr1 as string,
          side2: string = comparison as any;
        if (typeof attr1 !== "string") {
          const condition1 = this.prepareCondition(
            attr1 as Condition<any>,
            ctx
          );
          side1 = condition1.method as string;
          result.args = [...(result.args || []), ...(condition1.args || [])];
        }

        if (comparison instanceof Condition) {
          const condition2 = this.prepareCondition(comparison, ctx);
          side2 = condition2.method as string;
          result.args = [...(result.args || []), ...(condition2.args || [])];
        }

        result.method = `${side1} ${operator.toLowerCase()} ${side2}`;
        break;
      }
      case Operator.EQUAL:
        result.method = attr1 as string;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.DIFFERENT:
        result.method = `${attr1} diff`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.REGEXP:
        result.method = `${attr1} matches`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.BIGGER:
        result.method = `${attr1} bigger`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.BIGGER_EQ:
        result.method = `${attr1} bigger than equal`;
        break;
      case Operator.SMALLER:
        result.method = `${attr1} less`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.SMALLER_EQ:
        result.method = `${attr1} less than equal`;
        result.args = [...(result.args || []), comparison];
        break;
      case Operator.IN:
        result.method = `${attr1} in`;
        result.args = [...(result.args || []), comparison];
        break;
      default:
        throw new QueryError(`Unsupported operator ${operator}`);
    }

    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected squash(ctx: ContextOf<A>): PreparedStatement<any> | undefined {
    if (this.selectSelector && this.selectSelector.length) return undefined;
    if (this.groupBySelector) return undefined;
    if (this.countSelector) return undefined;
    if (this.maxSelector) return undefined;
    if (this.minSelector) return undefined;

    let attrFromWhere: string | undefined;
    if (this.whereCondition) {
      if (this.whereCondition["comparison"] instanceof Condition)
        return undefined;
      attrFromWhere = this.whereCondition["attr1"] as string;
    }

    const order: OrderBySelector<M> = this.orderBySelector
      ? this.orderBySelector
      : attrFromWhere
        ? [attrFromWhere as keyof M, OrderDirection.DSC]
        : [Model.pk(this.fromSelector), OrderDirection.DSC];

    const [attrFromOrderBy, sort] = order;

    const params: DirectionLimitOffset = {
      direction: sort,
    };

    if (this.limitSelector) params.limit = this.limitSelector;
    if (this.offsetSelector) params.offset = this.offsetSelector;

    const squashed: PreparedStatement<M> = {
      // listBy
      class: this.fromSelector,
      method: PreparedStatementKeys.LIST_BY,
      args: [attrFromOrderBy],
      params: params,
    } as PreparedStatement<M>;

    if (attrFromWhere) {
      // findBy
      squashed.method = PreparedStatementKeys.FIND_BY;
      squashed.args = [
        attrFromWhere,
        (this.whereCondition as Condition<M>)["comparison"] as string,
      ];
      squashed.params = params;
    }

    return squashed;
  }

  async prepare(ctx?: ContextOf<A>): Promise<StatementExecutor<M, R>> {
    ctx =
      ctx ||
      (await this.adapter.context(
        PersistenceKeys.QUERY,
        this.overrides || {},
        this.fromSelector
      ));

    if (
      this.isSimpleQuery() &&
      (ctx as ContextOf<A>).get("forcePrepareSimpleQueries")
    ) {
      const squashed = this.squash(ctx as ContextOf<A>);
      if (squashed) {
        this.prepared = squashed;
        return this;
      }
    }
    const args: (string | number)[] = [];
    const params: Record<"limit" | "skip", any> = {} as any;

    const prepared: PreparedStatement<any> = {
      class: this.fromSelector,
      args,
      params,
    } as any;

    const method: string[] = [QueryClause.FIND_BY];

    if (this.whereCondition) {
      const parsed = this.prepareCondition(
        this.whereCondition,
        ctx as ContextOf<A>
      );
      method.push(parsed.method);
      if (parsed.args && parsed.args.length)
        args.push(...(parsed.args as (string | number)[]));
    }
    if (this.selectSelector)
      method.push(
        QueryClause.SELECT,
        this.selectSelector.join(` ${QueryClause.AND.toLowerCase()} `)
      );
    if (this.orderBySelector)
      method.push(QueryClause.ORDER_BY, ...(this.orderBySelector as string[]));
    if (this.groupBySelector)
      method.push(QueryClause.GROUP_BY, this.groupBySelector as string);
    if (this.limitSelector) params.limit = this.limitSelector;
    if (this.offsetSelector) {
      params.skip = this.offsetSelector;
    }
    prepared.method = toCamelCase(method.join(" "));
    prepared.params = params;
    this.prepared = prepared;

    if (
      !(ctx as ContextOf<A>).get("forcePrepareSimpleQueries") ||
      (this.selectSelector && this.selectSelector.length) ||
      this.groupBySelector ||
      this.countSelector ||
      this.maxSelector ||
      this.minSelector
    ) {
      return this;
    }
    this.prepared = prepared;
    return this;
  }

  protected isSimpleQuery() {
    return !(
      (this.selectSelector && this.selectSelector.length) ||
      this.groupBySelector ||
      this.countSelector ||
      this.maxSelector ||
      this.minSelector
    );
  }

  protected abstract build(): Q;
  protected abstract parseCondition(condition: Condition<M>, ...args: any[]): Q;

  /**
   * @description Creates a paginator for the query
   * @summary Builds the query and wraps it in a RamPaginator to enable pagination of results.
   * This allows retrieving large result sets in smaller chunks.
   * @param {number} size - The page size (number of results per page)
   * @return {Promise<Paginator<M, R, RawRamQuery<M>>>} A promise that resolves to a paginator for the query
   */
  async paginate(
    size: number,
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<Paginator<M, R, Q>> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const ctx = args.pop() as ContextOf<A>; // handled by prefix. kept for example for overrides
    try {
      const query = this.build();
      return this.adapter.Paginator(
        this.prepared || query,
        size,
        this.fromSelector
      );
    } catch (e: any) {
      throw new QueryError(e);
    }
  }

  override toString() {
    return `${this.adapter.flavour} statement`;
  }
}
