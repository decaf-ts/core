import { Executor } from "../interfaces";
import {
  constructFromObject,
  Model,
  ModelArg,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import { QueryBuilder } from "./options";
import { QueryError } from "./errors";
import { Priority } from "./constants";
import { Statement } from "./Statement";

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
  implements Executor, QueryBuilder<Q>
{
  @required()
  readonly priority!: Priority;

  @required()
  @type("object")
  readonly statement!: Statement<Q>;

  protected constructor(clause?: ModelArg<Clause<Q>>) {
    super();
    constructFromObject<Clause<Q>>(this, clause);
    if (!this.statement)
      throw new QueryError("Missing statement. Should be impossible");
    this.statement.addClause(this);
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
    return this.statement!.execute();
  }

  toString() {
    return this.constructor.name;
  }

  // /**
  //  * @summary Factory method for {@link FromClause}
  //  * @param {{priority: number, statement: Statement, getPriority: Function, build: Function, process: Function}} clause
  //  */
  // static isClause(clause: Partial<Clause<any>>) {
  //   return clause instanceof Clause;
  //   return (
  //     clause.constructor &&
  //     clause.constructor.name &&
  //     clause.priority &&
  //     clause.statement &&
  //     clause.getPriority &&
  //     clause.build &&
  //     clause.execute
  //   );
  // }
}
