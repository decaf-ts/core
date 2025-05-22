import type { Constructor } from "@decaf-ts/decorator-validation";
import {
  minlength,
  Model,
  ModelErrorDefinition,
  required,
  type,
  sf,
} from "@decaf-ts/decorator-validation";
import { Executor, RawExecutor } from "../interfaces";
import { MandatoryPriorities, StatementType } from "./constants";
import { QueryError } from "./errors";
import { Clause } from "./Clause";
import { clauseSequence } from "../validators";
import { Adapter } from "../persistence";
import { findPrimaryKey, InternalError } from "@decaf-ts/db-decorators";
import { Paginator } from "./Paginator";

/**
 * @summary Statement Class
 * @description holds all the clauses until they can be processed
 *
 * @param {ModelArg} [statement]
 *
 * @class Statement
 * @extends Model
 * @implements Executor
 * @implements RawExecutor
 *
 * @category Query
 */
export abstract class Statement<Q, M extends Model, R>
  extends Model
  implements Executor<R>, RawExecutor<Q>
{
  @required()
  @minlength(MandatoryPriorities.length)
  @clauseSequence()
  protected clauses?: Clause<Q, M, R>[] = undefined;
  @required()
  @type(["object"])
  protected adapter: Adapter<any, Q, any, any>;
  @required()
  protected target?: Constructor<M> = undefined;

  selectors?: (keyof M)[];

  @required()
  protected type?: string = undefined;

  protected constructor(db: Adapter<any, Q, any, any>) {
    super();
    this.adapter = db;
  }

  protected build(): Q {
    if (!this.clauses)
      throw new QueryError(sf("Failed to build Statement:\n{0}", "No Clauses"));
    this.clauses.sort((c1, c2) => {
      return c1.getPriority() - c2.getPriority();
    });

    const errors = this.hasErrors();
    if (errors) throw new QueryError(`Poorly built statement: ${errors}`);

    let query: Q;
    try {
      const iterator = function (
        clauses: Clause<Q, M, R>[],
        previous: any = {}
      ): Q {
        const c = clauses.shift();
        if (!c) return previous as Q;
        const results = c.build(previous);
        return iterator(clauses, results as any);
      };

      query = iterator(new Array(...(this.clauses as Clause<Q, M, R>[]))) as Q;
    } catch (e: any) {
      throw new QueryError(e);
    }

    return query;
  }

  /**
   * @inheritDoc
   */
  async execute(): Promise<R> {
    try {
      const query: Q = this.build();
      return (await this.raw(query)) as R;
    } catch (e: any) {
      throw new InternalError(e);
    }
  }

  /**
   * @inheritDoc
   */
  abstract paginate(size: number): Promise<Paginator<R, Q>>;

  async raw<R>(rawInput: Q, ...args: any[]): Promise<R> {
    const results = await this.adapter.raw<R>(rawInput, true, ...args);
    if (!this.selectors) return results;
    if (!this.target)
      throw new InternalError(
        "No target defined in statement. should never happen"
      );

    const pkAttr = findPrimaryKey(new this.target() as any).id;

    const processor = function recordProcessor(
      this: Statement<Q, M, R>,
      r: any
    ) {
      const id = r[pkAttr];
      return this.adapter.revert(
        r,
        this.target as Constructor<any>,
        pkAttr,
        id
      ) as any;
    }.bind(this as any);

    if (Array.isArray(results)) return results.map(processor) as R;
    return processor(results) as R;
  }

  /**
   * @inheritDoc
   */
  hasErrors(...exceptions: string[]): ModelErrorDefinition | undefined {
    const errors = super.hasErrors(...exceptions);
    if (errors) return errors;

    for (const i in this.clauses) {
      const err = this.clauses[i as any].hasErrors();
      if (err) return err;
    }
  }

  /**
   * @summary Adds a clause to the Statement
   * @param {Clause} clause
   */
  addClause(clause: Clause<Q, M, R>) {
    if (!this.clauses) this.clauses = [];

    const priority = clause.getPriority();
    const currentPriority = this.clauses
      .map((c, i) => ({ index: i, clause: c }))
      .find((c) => c.clause.getPriority() === priority);
    if (currentPriority) {
      this.clauses[currentPriority.index] = clause;
    }
    this.clauses.push(clause);
  }

  getAdapter(): Adapter<any, Q, any, any> {
    return this.adapter;
  }

  /**
   * @summary Defines the output class (when existing)
   * @param {Constructor} clazz
   */
  setTarget(clazz: Constructor<any>) {
    if (this.target)
      throw new QueryError(
        sf("Output class already defined to {0}", this.target!.name)
      );
    this.target = clazz;
  }

  getTarget() {
    if (!this.target)
      throw new InternalError("No target defined for statement");
    return this.target;
  }

  setSelectors(selectors: (keyof M)[]) {
    this.selectors = selectors;
  }

  setMode(type: StatementType) {
    this.type = type;
  }
}
