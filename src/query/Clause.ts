import { Executor } from "../interfaces";
import {
  Model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { QueryBuilder } from "./options";
import { QueryError } from "./errors";
import { Priority } from "./constants";
import { Statement } from "./Statement";
import { Paginatable } from "../interfaces/Paginatable";
import { Paginator } from "./Paginator";

/**
 */

/**
 * @summary Clause Class
 * @description Represents a Clause in a {@link Statement}
 *
 * @typedef Q Represents que query object the persistence adapter uses
 *
 * @param {ModelArg<Clause<Q>>} [clause]
 *
 * @class Clause
 * @extends Model
 * @implements Executor
 * @implements QueryBuilder
 * @abstract
 *
 * @category Query
 * @subcategory Clauses
 */
export abstract class Clause<Q>
  extends Model
  implements Executor, Paginatable, QueryBuilder<Q>
{
  @required()
  readonly priority!: Priority;

  @required()
  @type("object")
  readonly statement!: Statement<Q, any>;

  protected constructor(clause?: ModelArg<Clause<Q>>) {
    super();
    this.priority = clause?.priority;
    this.statement = clause?.statement;
    if (!this.statement || !this.priority)
      throw new QueryError(
        "Missing statement or priority. Should be impossible"
      );
    this.statement.addClause(this);
  }

  protected get adapter() {
    return this.statement.getAdapter();
  }

  protected get Clauses() {
    return this.adapter.Clauses;
  }

  /**
   * @summary return the priority of the clause
   * @see Priority
   */
  getPriority(): number {
    return this.priority as number;
  }

  abstract build(previous: Q): Q;

  /**
   * @inheritDoc
   * @abstract
   */
  async execute<R>(): Promise<R> {
    return this.statement.execute();
  }
  /**
   * @inheritDoc
   * @abstract
   */
  async paginate<R>(size: number): Promise<Paginator<R, Q>> {
    return this.statement.paginate(size);
  }

  toString() {
    return this.constructor.name;
  }
}
