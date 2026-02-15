import { Model } from "@decaf-ts/decorator-validation";
import type { Executor, RawExecutor } from "../interfaces";
import type {
  FromSelector,
  GroupBySelector,
  OrderBySelector,
  OrderDirectionInput,
  SelectSelector,
} from "./selectors";
import { Condition } from "./Condition";
import { prefixMethod } from "@decaf-ts/db-decorators";
import { final, Logger, toCamelCase } from "@decaf-ts/logging";
import type {
  CountDistinctOption,
  CountOption,
  DistinctOption,
  GroupByResult,
  MaxOption,
  MinOption,
  OffsetOption,
  OrderAndGroupOption,
  OrderByResult,
  OrderByThenByOption,
  PreparableStatementExecutor,
  SelectOption,
  StatementExecutor,
  SumOption,
  AvgOption,
  WhereOption,
} from "./options";
import { Paginatable } from "../interfaces/Paginatable";
import { Paginator } from "./Paginator";
import { Adapter } from "../persistence/Adapter";
import type { AdapterFlags, ContextOf } from "../persistence/types";
import { PersistenceKeys } from "../persistence/constants";
import { UnsupportedError } from "../persistence/errors";
import { QueryError } from "./errors";
import { Constructor } from "@decaf-ts/decoration";
import {
  type ContextualArgs,
  ContextualLoggedClass,
  type MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { DirectionLimitOffset, PreparedStatement, QueryClause } from "./types";
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
  protected countSelector?: SelectSelector<M> | null;
  protected countDistinctSelector?: SelectSelector<M> | null;
  protected sumSelector?: SelectSelector<M>;
  protected avgSelector?: SelectSelector<M>;
  protected _inCountMode: boolean = false;
  protected fromSelector!: Constructor<M>;
  protected whereCondition?: Condition<M>;
  protected orderBySelectors?: OrderBySelector<M>[];
  protected groupBySelectors?: GroupBySelector<M>[];
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
        (...args: MaybeContextualArg<ContextOf<A>>) => {
          return this.executionPrefix(m, ...args);
        },
        m.name
      );
    });
  }

  protected async executionPrefix(
    method: any,
    ...args: MaybeContextualArg<ContextOf<A>>
  ) {
    const { ctx, ctxArgs, log } = (
      await this.adapter["logCtx"](
        [this.fromSelector, ...args],
        method.name === this.paginate.name
          ? PreparedStatementKeys.PAGE_BY
          : PersistenceKeys.QUERY,
        true,
        this.overrides || {}
      )
    ).for(method);

    ctxArgs.shift();

    const forceSimple = ctx.get("forcePrepareSimpleQueries");
    const forceComplex = ctx.get("forcePrepareComplexQueries");
    log.silly(
      `statement force simple ${forceSimple}, forceComplex: ${forceComplex}`
    );
    // Simple queries or simple aggregation queries (aggregations without where conditions)
    // Also exclude multi-level groupBy from simple aggregation squashing
    const isSimpleAggregation =
      this.hasAggregation() &&
      !this.whereCondition &&
      !this.selectSelector?.length &&
      (this.groupBySelectors?.length || 0) <= 1;
    if (
      (forceSimple && (this.isSimpleQuery() || isSimpleAggregation)) ||
      forceComplex
    ) {
      log.silly(
        `squashing ${!forceComplex ? "simple" : "complex"} query to prepared statement`
      );
      await this.prepare(ctx);
      log.silly(
        `squashed ${!forceComplex ? "simple" : "complex"} query to ${JSON.stringify(this.prepared, null, 2)}`
      );
    }
    return ctxArgs;
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

  // Overload for standalone distinct - requires a selector
  distinct<S extends SelectSelector<M>>(selector: S): DistinctOption<M, M[S][]>;
  // Overload for count().distinct() - no selector needed
  distinct(): CountDistinctOption<M>;

  @final()
  distinct<S extends SelectSelector<M>>(
    selector?: S
  ): DistinctOption<M, M[S][]> | CountDistinctOption<M> {
    // When chained after count(), make it a count distinct
    if (this._inCountMode) {
      // Use the count selector as the field to count distinct on
      this.countDistinctSelector = this.countSelector;
      this.countSelector = undefined;
      this._inCountMode = false;
      return this as unknown as CountDistinctOption<M>;
    }
    // Standalone distinct requires a selector
    if (!selector) {
      throw new QueryError(
        "distinct() requires a selector when not chained after count()"
      );
    }
    this.distinctSelector = selector;
    return this as unknown as DistinctOption<M, M[S][]>;
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
  sum<S extends SelectSelector<M>>(selector: S): SumOption<M, number> {
    this.sumSelector = selector;
    return this as SumOption<M, number>;
  }

  @final()
  avg<S extends SelectSelector<M>>(selector: S): AvgOption<M, number> {
    this.avgSelector = selector;
    return this as AvgOption<M, number>;
  }

  @final()
  count<S extends SelectSelector<M>>(selector?: S): CountOption<M> {
    this.countSelector = selector ?? null;
    this._inCountMode = true;
    return this as unknown as CountOption<M>;
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

  public orderBy(selector: OrderBySelector<M>): OrderByResult<M, R>;
  public orderBy(
    attribute: keyof M,
    direction: OrderDirectionInput
  ): OrderByResult<M, R>;

  @final()
  public orderBy(
    selectorOrAttribute: OrderBySelector<M> | keyof M,
    direction?: OrderDirectionInput
  ): OrderByResult<M, R> {
    this.orderBySelectors = [
      this.normalizeOrderCriterion(selectorOrAttribute, direction),
    ];
    return this as OrderByResult<M, R>;
  }

  public thenBy(selector: GroupBySelector<M>): GroupByResult<M>;
  public thenBy(selector: OrderBySelector<M>): OrderByThenByOption<M, R>;
  public thenBy(
    attribute: keyof M,
    direction: OrderDirectionInput
  ): OrderByThenByOption<M, R>;

  @final()
  public thenBy(
    selectorOrAttribute: OrderBySelector<M> | keyof M,
    direction?: OrderDirectionInput
  ): OrderByThenByOption<M, R> | GroupByResult<M> {
    const isOrderingCriterion =
      Array.isArray(selectorOrAttribute) || typeof direction !== "undefined";
    if (isOrderingCriterion) {
      if (!this.orderBySelectors || !this.orderBySelectors.length)
        throw new QueryError("thenBy requires orderBy to be called first");
      this.orderBySelectors.push(
        this.normalizeOrderCriterion(selectorOrAttribute, direction)
      );
      return this as unknown as OrderByThenByOption<M, R>;
    }
    if (!this.groupBySelectors || !this.groupBySelectors.length)
      throw new QueryError(
        "groupBy must be called before chaining group selectors"
      );
    this.groupBySelectors.push(selectorOrAttribute as GroupBySelector<M>);
    return this as unknown as GroupByResult<M>;
  }

  private normalizeOrderCriterion(
    selectorOrAttribute: OrderBySelector<M> | keyof M,
    direction?: OrderDirectionInput
  ): OrderBySelector<M> {
    if (Array.isArray(selectorOrAttribute)) {
      const [attribute, dir] = selectorOrAttribute;
      return [attribute, this.normalizeOrderDirection(dir)];
    }
    return [selectorOrAttribute, this.normalizeOrderDirection(direction)];
  }

  private normalizeOrderDirection(
    direction?: OrderDirectionInput
  ): OrderDirection {
    if (!direction) {
      throw new QueryError(
        "orderBy direction is required when specifying the attribute separately."
      );
    }
    const normalized = String(direction).toLowerCase();
    if (normalized === OrderDirection.ASC) return OrderDirection.ASC;
    if (normalized === OrderDirection.DSC) return OrderDirection.DSC;
    throw new QueryError(
      `Invalid OrderBy direction ${direction}. Expected one of: ${Object.values(OrderDirection).join(", ")}.`
    );
  }

  @final()
  public groupBy<Key extends GroupBySelector<M>>(
    selector: Key
  ): GroupByResult<M, [Key]> {
    if (this.orderBySelectors && this.orderBySelectors.length) {
      throw new QueryError("groupBy must be called before orderBy.");
    }
    this.groupBySelectors = [selector];
    return this as unknown as GroupByResult<M, [Key]>;
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
    const { log, ctx, ctxArgs } = this.logCtx(args, this.execute);
    try {
      if (this.prepared) return this.executePrepared(...(args as any));
      log.silly(`Building raw statement...`);
      const query: Q = this.build();
      log.silly(`executing raw statement`);
      const results = (await this.raw<R>(
        query,
        ...(ctxArgs as ContextualArgs<ContextOf<A>>)
      )) as unknown as R;
      if (this.hasAggregation()) {
        return results;
      }
      if (!this.selectSelector) {
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

        if (this.groupBySelectors?.length) {
          return this.revertGroupedResults(results, processor) as R;
        }
        if (Array.isArray(results)) return results.map(processor) as R;
        return processor(results) as R;
      }
      return results;
    } catch (e: unknown) {
      throw new QueryError(e as Error);
    }
  }

  protected revertGroupedResults(
    value: any,
    processor: (record: any) => any
  ): any {
    if (Array.isArray(value)) return value.map(processor);
    if (value && typeof value === "object") {
      return Object.entries(value).reduce<Record<string, any>>(
        (acc, [key, val]) => {
          acc[key] = this.revertGroupedResults(val, processor);
          return acc;
        },
        {}
      );
    }
    return value;
  }

  protected async executePrepared(
    ...argz: ContextualArgs<ContextOf<A>>
  ): Promise<R> {
    const repo = Repository.forModel(this.fromSelector, this.adapter.alias);
    const { method, args, params } = this.prepared as PreparedStatement<any>;
    return repo.statement(method, ...args, params, ...argz);
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
    if (this.hasAggregation()) {
      return results;
    }
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
    const defaultQuery = this.matchDefaultQueryCondition();
    if (defaultQuery) {
      const direction = this.getOrderDirection();
      return {
        class: this.fromSelector,
        method: PreparedStatementKeys.FIND,
        args: [defaultQuery.value, direction],
        params: {
          direction,
        },
      } as PreparedStatement<M>;
    }

    // If there's a where condition with complex conditions (nested Conditions), can't squash
    if (this.whereCondition) {
      if (this.whereCondition["comparison"] instanceof Condition)
        return undefined;
    }

    // Try to squash simple aggregation queries without where conditions
    if (!this.whereCondition && !this.selectSelector?.length) {
      // Count query
      if (
        typeof this.countSelector !== "undefined" &&
        !this.countDistinctSelector
      ) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.COUNT_OF,
          args: this.countSelector !== null ? [this.countSelector] : [],
          params: {},
        } as PreparedStatement<M>;
      }

      // Max query
      if (this.maxSelector) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.MAX_OF,
          args: [this.maxSelector],
          params: {},
        } as PreparedStatement<M>;
      }

      // Min query
      if (this.minSelector) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.MIN_OF,
          args: [this.minSelector],
          params: {},
        } as PreparedStatement<M>;
      }

      // Avg query
      if (this.avgSelector) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.AVG_OF,
          args: [this.avgSelector],
          params: {},
        } as PreparedStatement<M>;
      }

      // Sum query
      if (this.sumSelector) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.SUM_OF,
          args: [this.sumSelector],
          params: {},
        } as PreparedStatement<M>;
      }

      // Distinct query
      if (this.distinctSelector) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.DISTINCT_OF,
          args: [this.distinctSelector],
          params: {},
        } as PreparedStatement<M>;
      }

      // Group by query (simple single-level grouping)
      if (this.groupBySelectors?.length === 1) {
        return {
          class: this.fromSelector,
          method: PreparedStatementKeys.GROUP_OF,
          args: [this.groupBySelectors[0]],
          params: {},
        } as PreparedStatement<M>;
      }
    }

    // Can't squash complex queries with select/groupBy/aggregations that have where conditions
    if (this.selectSelector && this.selectSelector.length) return undefined;
    if (this.groupBySelectors && this.groupBySelectors.length) return undefined;
    if (typeof this.countSelector !== "undefined") return undefined;
    if (this.countDistinctSelector) return undefined;
    if (this.maxSelector) return undefined;
    if (this.minSelector) return undefined;
    if (this.sumSelector) return undefined;
    if (this.avgSelector) return undefined;

    let attrFromWhere: string | undefined;
    if (this.whereCondition) {
      attrFromWhere = this.whereCondition["attr1"] as string;
    }

    const order: OrderBySelector<M> = this.orderBySelectors?.[0]
      ? this.orderBySelectors[0]
      : attrFromWhere
        ? [attrFromWhere as keyof M, OrderDirection.DSC]
        : [Model.pk(this.fromSelector), OrderDirection.DSC];

    const [attrFromOrderBy, sort] = order;

    const params: DirectionLimitOffset = {
      direction: sort as any,
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

  private matchDefaultQueryCondition():
    | {
        value: string;
        attributes: string[];
      }
    | undefined {
    if (!this.whereCondition) return undefined;
    const found = this.extractDefaultStartsWithAttributes(this.whereCondition);
    if (!found) return undefined;
    const defaultAttrs = Model.defaultQueryAttributes(this.fromSelector);
    if (!defaultAttrs || !defaultAttrs.length) return undefined;
    const normalizedDefault = Array.from(new Set(defaultAttrs.map(String)));
    const normalizedFound = Array.from(new Set(found.attributes.map(String)));
    if (normalizedDefault.length !== normalizedFound.length) return undefined;
    if (normalizedDefault.every((attr) => normalizedFound.includes(attr))) {
      return {
        value: found.value,
        attributes: normalizedDefault,
      };
    }
    return undefined;
  }

  private extractDefaultStartsWithAttributes(
    condition: Condition<M>
  ): { attributes: string[]; value: string } | undefined {
    const collected = this.collectStartsWithAttributes(condition);
    if (!collected) return undefined;
    return {
      attributes: Array.from(new Set(collected.attributes)),
      value: collected.value,
    };
  }

  private collectStartsWithAttributes(
    condition: Condition<M> | undefined
  ): { attributes: string[]; value: string } | undefined {
    if (!condition) return undefined;
    const { attr1, operator, comparison } = condition as unknown as {
      attr1: string | Condition<M>;
      operator: Operator | GroupOperator;
      comparison: any;
    };
    if (operator === Operator.STARTS_WITH) {
      if (typeof attr1 !== "string" || typeof comparison !== "string")
        return undefined;
      return {
        attributes: [attr1],
        value: comparison,
      };
    }
    if (operator === GroupOperator.OR) {
      const left =
        attr1 instanceof Condition
          ? this.collectStartsWithAttributes(attr1 as Condition<M>)
          : undefined;
      const right =
        comparison instanceof Condition
          ? this.collectStartsWithAttributes(comparison as Condition<M>)
          : undefined;
      if (left && right && left.value === right.value) {
        return {
          attributes: [...left.attributes, ...right.attributes],
          value: left.value,
        };
      }
      return undefined;
    }
    if (operator === GroupOperator.AND) {
      const left =
        attr1 instanceof Condition
          ? this.collectStartsWithAttributes(attr1 as Condition<M>)
          : undefined;
      if (left) return left;
      const right =
        comparison instanceof Condition
          ? this.collectStartsWithAttributes(comparison as Condition<M>)
          : undefined;
      return right;
    }
    return undefined;
  }

  private getOrderDirection(): OrderDirection {
    return (
      (this.orderBySelectors?.[0]?.[1] as OrderDirection) ?? OrderDirection.ASC
    );
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

    // Also try to squash aggregation queries
    if (
      (ctx as ContextOf<A>).get("forcePrepareSimpleQueries") ||
      (ctx as ContextOf<A>).get("forcePrepareComplexQueries")
    ) {
      const squashed = this.squash(ctx as ContextOf<A>);
      if (squashed) {
        this.prepared = squashed;
        return this;
      }
    }

    const args: (string | number)[] = [];
    const params: any = {} as any;

    const prepared: PreparedStatement<any> = {
      class: this.fromSelector,
      args,
      params,
    } as any;

    // Determine the method prefix based on the query type
    let methodPrefix: string = QueryClause.FIND_BY;
    let selectorField: string | undefined;

    if (typeof this.countSelector !== "undefined") {
      methodPrefix = QueryClause.COUNT_BY;
      selectorField =
        this.countSelector !== null
          ? (this.countSelector as string)
          : undefined;
    } else if (this.sumSelector) {
      methodPrefix = QueryClause.SUM_BY;
      selectorField = this.sumSelector as string;
    } else if (this.avgSelector) {
      methodPrefix = QueryClause.AVG_BY;
      selectorField = this.avgSelector as string;
    } else if (this.minSelector) {
      methodPrefix = QueryClause.MIN_BY;
      selectorField = this.minSelector as string;
    } else if (this.maxSelector) {
      methodPrefix = QueryClause.MAX_BY;
      selectorField = this.maxSelector as string;
    } else if (this.distinctSelector) {
      methodPrefix = QueryClause.DISTINCT_BY;
      selectorField = this.distinctSelector as string;
    } else if (
      this.groupBySelectors?.length &&
      !this.selectSelector?.length &&
      !this.whereCondition
    ) {
      // Group-only query (no select, no where)
      methodPrefix = QueryClause.GROUP_BY_PREFIX;
      selectorField = this.groupBySelectors[0] as string;
    }
    // If there's a where condition or selectSelector, use findBy prefix even with groupBy

    const method: string[] = [methodPrefix];
    if (selectorField) {
      method.push(selectorField);
    }

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
    if (this.orderBySelectors?.length) {
      const [primary, ...secondary] = this.orderBySelectors;
      method.push(QueryClause.ORDER_BY, primary[0] as string);
      params.direction = primary[1];
      if (secondary.length) {
        params.order = this.orderBySelectors.map(([attr, dir]) => [attr, dir]);
        secondary.forEach(([attr]) => {
          method.push(QueryClause.THEN_BY, attr as string);
        });
      }
    }
    // Handle groupBy for non-aggregation queries (already handled for group prefix)
    if (
      this.groupBySelectors?.length &&
      methodPrefix !== QueryClause.GROUP_BY_PREFIX
    ) {
      const [primary, ...rest] = this.groupBySelectors;
      method.push(QueryClause.GROUP_BY, primary as string);
      rest.forEach((attr) => method.push(QueryClause.THEN_BY, attr as string));
    } else if (
      this.groupBySelectors?.length &&
      methodPrefix === QueryClause.GROUP_BY_PREFIX
    ) {
      // For group prefix, add additional group fields as ThenBy
      const rest = this.groupBySelectors.slice(1);
      rest.forEach((attr) => method.push(QueryClause.THEN_BY, attr as string));
    }
    if (this.limitSelector) params.limit = this.limitSelector;
    if (this.offsetSelector) {
      params.skip = this.offsetSelector;
    }
    prepared.method = toCamelCase(method.join(" "));
    prepared.params = params;
    this.prepared = prepared;
    return this;
  }

  protected isSimpleQuery() {
    return !(
      (this.selectSelector && this.selectSelector.length) ||
      (this.groupBySelectors && this.groupBySelectors.length) ||
      typeof this.countSelector !== "undefined" ||
      this.countDistinctSelector ||
      this.maxSelector ||
      this.minSelector ||
      this.sumSelector ||
      this.avgSelector ||
      this.distinctSelector
    );
  }

  protected hasAggregation(): boolean {
    return (
      typeof this.countSelector !== "undefined" ||
      typeof this.countDistinctSelector !== "undefined" ||
      typeof this.maxSelector !== "undefined" ||
      typeof this.minSelector !== "undefined" ||
      typeof this.sumSelector !== "undefined" ||
      typeof this.avgSelector !== "undefined" ||
      typeof this.distinctSelector !== "undefined" ||
      (this.groupBySelectors?.length || 0) > 0
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
      return this.adapter.Paginator(
        this.prepared || this.build(),
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
