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

export class RamClauseFactory extends ClauseFactory<
  RamStorage,
  RamQuery<any>,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    super(adapter);
  }

  from<M extends Model>(
    statement: RamStatement<M>,
    selector: FromSelector<M>
  ): FromClause<RamQuery<any>, M> {
    return new RamFromClause({ statement: statement, selector: selector });
  }

  groupBy(
    statement: RamStatement<any>,
    selector: GroupBySelector
  ): GroupByClause<RamQuery<any>> {
    return new (class extends GroupByClause<RamQuery<any>> {
      constructor(clause: ModelArg<GroupByClause<RamQuery<any>>>) {
        super(clause);
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      build(query: RamQuery<any>): RamQuery<any> {
        throw new InternalError("Not implemented");
      }
    })({
      statement: statement,
      selector: selector,
    });
  }

  insert<M extends Model>(): InsertClause<RamQuery<any>, M> {
    return new RamInsertClause({
      statement: new RamStatement(this.adapter),
    });
  }

  limit(
    statement: RamStatement<any>,
    selector: LimitSelector
  ): LimitClause<RamQuery<any>> {
    return new (class extends LimitClause<RamQuery<any>> {
      constructor(clause: ModelArg<LimitClause<RamQuery<any>>>) {
        super(clause);
      }

      build(query: RamQuery<any>): RamQuery<any> {
        query.limit = this.selector as number;
        return query;
      }
    })({
      statement: statement,
      selector: selector,
    });
  }

  offset(
    statement: RamStatement<any>,
    selector: OffsetSelector
  ): OffsetClause<RamQuery<any>> {
    return new (class extends OffsetClause<RamQuery<any>> {
      constructor(clause: ModelArg<OffsetClause<RamQuery<any>>>) {
        super(clause);
      }

      build(query: RamQuery<any>): RamQuery<any> {
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

  orderBy(
    statement: RamStatement<any>,
    selector: OrderBySelector[]
  ): OrderByClause<RamQuery<any>> {
    return new RamOrderByClause({
      statement: statement,
      selector: selector,
    });
  }

  select<M extends Model>(
    selector: SelectSelector | undefined
  ): SelectClause<RamQuery<any>, M> {
    return new RamSelectClause({
      statement: new RamStatement(this.adapter),
      selector: selector,
    });
  }

  values<M extends Model>(
    statement: RamStatement<any>,
    values: M[]
  ): ValuesClause<RamQuery<any>, M> {
    return new RamValuesClause<M>({
      statement: statement,
      values: values,
    });
  }

  where(
    statement: RamStatement<any>,
    condition: Condition
  ): WhereClause<RamQuery<any>> {
    return new RamWhereClause({
      statement: statement,
      condition: condition,
    });
  }
}
