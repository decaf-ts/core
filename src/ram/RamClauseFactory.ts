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

  groupBy<M extends Model>(
    statement: RamStatement<M>,
    selector: GroupBySelector<M>
  ): GroupByClause<RamQuery<M>, M> {
    return new (class extends GroupByClause<RamQuery<M>, M> {
      constructor(clause: ModelArg<GroupByClause<RamQuery<M>, M>>) {
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

  limit<M extends Model>(
    statement: RamStatement<M>,
    selector: LimitSelector
  ): LimitClause<RamQuery<M>> {
    return new (class extends LimitClause<RamQuery<M>> {
      constructor(clause: ModelArg<LimitClause<RamQuery<M>>>) {
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

  offset<M extends Model>(
    statement: RamStatement<M>,
    selector: OffsetSelector
  ): OffsetClause<RamQuery<M>> {
    return new (class extends OffsetClause<RamQuery<M>> {
      constructor(clause: ModelArg<OffsetClause<RamQuery<M>>>) {
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

  orderBy<M extends Model>(
    statement: RamStatement<M>,
    selector: OrderBySelector<M>[]
  ): OrderByClause<RamQuery<M>, M> {
    return new RamOrderByClause({
      statement: statement,
      selector: selector,
    });
  }

  select<M extends Model>(
    selector: SelectSelector<M> | undefined
  ): SelectClause<RamQuery<M>, M> {
    return new RamSelectClause({
      statement: new RamStatement(this.adapter),
      selector: selector,
    });
  }

  values<M extends Model>(
    statement: RamStatement<M>,
    values: M[]
  ): ValuesClause<RamQuery<M>, M> {
    return new RamValuesClause<M>({
      statement: statement,
      values: values,
    });
  }

  where<M extends Model>(
    statement: RamStatement<M>,
    condition: Condition<M>
  ): WhereClause<RamQuery<M>, M> {
    return new RamWhereClause({
      statement: statement,
      condition: condition,
    });
  }
}
