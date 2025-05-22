import {
  ClauseFactory,
  Condition,
  FromClause,
  FromSelector,
  GroupByClause,
  GroupBySelector,
  InsertClause,
  LimitClause,
  LimitSelector,
  OffsetClause,
  OffsetSelector,
  OrderByClause,
  OrderBySelector,
  QueryError,
  SelectClause,
  SelectSelector,
  ValuesClause,
  WhereClause,
} from "../query";
import { RamQuery, RamStorage } from "./types";
import { RamAdapter } from "./RamAdapter";
import { RamStatement } from "./RamStatement";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { InternalError } from "@decaf-ts/db-decorators";
import { RamInsertClause } from "./clauses/InsertClause";
import { RamOrderByClause } from "./clauses/OrderByClause";
import { RamSelectClause } from "./clauses/SelectClause";
import { RamValuesClause } from "./clauses/ValuesClause";
import { RamWhereClause } from "./clauses/WhereClause";
import { RamFromClause } from "./clauses/FromClause";

export class RamClauseFactory extends ClauseFactory<RamStorage, RamAdapter> {
  constructor(adapter: RamAdapter) {
    super(adapter);
  }

  from<M extends Model, R>(
    statement: RamStatement<M, R>,
    selector: FromSelector<M>
  ): FromClause<RamQuery<M>, M, R> {
    return new RamFromClause<M, R>({
      statement: statement,
      selector: selector,
    });
  }

  groupBy<M extends Model, R>(
    statement: RamStatement<M, R>,
    selector: GroupBySelector<M>
  ): GroupByClause<RamQuery<M>, M, R> {
    return new (class extends GroupByClause<RamQuery<M>, M, R> {
      constructor(clause: ModelArg<GroupByClause<RamQuery<M>, M, R>>) {
        super(clause);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      build(query: RamQuery<M>): RamQuery<M> {
        throw new InternalError("Not implemented");
      }
    })({
      statement: statement,
      selector: selector,
    });
  }

  insert<M extends Model>(): InsertClause<RamQuery<M>, M> {
    return new RamInsertClause({
      statement: new RamStatement(this.adapter),
    });
  }

  limit<M extends Model, R>(
    statement: RamStatement<M, R>,
    selector: LimitSelector
  ): LimitClause<RamQuery<M>, M, R> {
    return new (class extends LimitClause<RamQuery<M>, M, R> {
      constructor(clause: ModelArg<LimitClause<RamQuery<M>, M, R>>) {
        super(clause);
      }

      build(query: RamQuery<M>): RamQuery<M> {
        query.limit = this.selector as number;
        return query;
      }
    })({
      statement: statement,
      selector: selector,
    });
  }

  offset<M extends Model, R>(
    statement: RamStatement<M, R>,
    selector: OffsetSelector
  ): OffsetClause<RamQuery<M>, M, R> {
    return new (class extends OffsetClause<RamQuery<M>, M, R> {
      constructor(clause: ModelArg<OffsetClause<RamQuery<M>, M, R>>) {
        super(clause);
      }

      build(query: RamQuery<M>): RamQuery<M> {
        const skip: number = parseInt(this.selector as unknown as string);
        if (isNaN(skip)) throw new QueryError("Failed to parse offset");
        query.skip = skip;
        return query;
      }
    })({
      statement: statement,
      selector: selector,
    });
  }

  orderBy<M extends Model, R>(
    statement: RamStatement<M, R>,
    selector: OrderBySelector<M>[]
  ): OrderByClause<RamQuery<M>, M, R> {
    return new RamOrderByClause({
      statement: statement,
      selector: selector,
    });
  }
  select<
    M extends Model,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const S extends readonly SelectSelector<M>[],
  >(): SelectClause<any, M, M[]>;
  select<M extends Model, const S extends readonly SelectSelector<M>[]>(
    selector: readonly [...S]
  ): SelectClause<any, M, Pick<M, S[number]>>;
  select<M extends Model, const S extends SelectSelector<M>[]>(
    selector?: readonly [...S]
  ): SelectClause<any, M, M[]> | SelectClause<any, M, Pick<M, S[number]>> {
    return new RamSelectClause<M, M[]>({
      statement: new RamStatement(this.adapter),
      selector: selector,
    });
  }

  values<M extends Model, R>(
    statement: RamStatement<M, R>,
    values: M[]
  ): ValuesClause<RamQuery<M>, M> {
    return new RamValuesClause<M>({
      statement: statement,
      values: values,
    });
  }

  where<M extends Model, R>(
    statement: RamStatement<M, R>,
    condition: Condition<M>
  ): WhereClause<RamQuery<M>, M, R> {
    return new RamWhereClause({
      statement: statement,
      condition: condition,
    });
  }
}
