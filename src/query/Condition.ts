import { AttributeOption, ConditionBuilderOption } from "./options";
import {
  Model,
  ModelErrorDefinition,
  required,
} from "@decaf-ts/decorator-validation";
import { GroupOperator, Operator } from "./constants";
import { QueryError } from "./errors";

/**
 * @summary Condition Class
 * @description Represents a logical condition
 *
 * @param {string | Condition} attr1
 * @param {Operator | GroupOperator} operator
 * @param {string | Condition} comparison
 *
 * @class Condition
 * @implements Executor
 *
 * @category Query
 * @subcategory Conditions
 */

export class Condition<M extends Model> extends Model {
  @required()
  protected attr1?: string | Condition<M> = undefined;
  @required()
  protected operator?: Operator | GroupOperator = undefined;
  @required()
  protected comparison?: any = undefined;

  private constructor(
    attr1: string | Condition<M>,
    operator: Operator | GroupOperator,
    comparison: any
  ) {
    super();
    this.attr1 = attr1;
    this.operator = operator;
    this.comparison = comparison;
  }

  /**
   * @summary Joins 2 {@link Condition}s on an {@link Operator#AND} operation
   * @param {Condition} condition
   */
  and(condition: Condition<M>): Condition<M> {
    return Condition.and(this, condition);
  }

  /**
   * @summary Joins 2 {@link Condition}s on an {@link Operator#OR} operation
   * @param {Condition} condition
   */
  or(condition: Condition<M>): Condition<M> {
    return Condition.or(this, condition);
  }

  /**
   * @summary excludes a valut from the result
   * @param val
   */
  not(val: any): Condition<M> {
    return new Condition(this, Operator.NOT, val);
  }

  /**
   * @inheritDoc
   */
  hasErrors(...exceptions: string[]): ModelErrorDefinition | undefined {
    const errors = super.hasErrors(...exceptions);
    if (errors) return errors;

    const invalidOpMessage = `Invalid operator ${this.operator}}`;

    if (typeof this.attr1 === "string") {
      if (this.comparison instanceof Condition)
        return {
          comparison: {
            condition: "Both sides of the comparison must be of the same type",
          },
        } as ModelErrorDefinition;
      if (Object.values(Operator).indexOf(this.operator as Operator) === -1)
        return {
          operator: {
            condition: invalidOpMessage,
          },
        } as ModelErrorDefinition;
    }

    if (this.attr1 instanceof Condition) {
      if (
        !(this.comparison instanceof Condition) &&
        this.operator !== Operator.NOT
      )
        return {
          comparison: {
            condition: invalidOpMessage,
          },
        } as ModelErrorDefinition;
      if (
        Object.values(GroupOperator).indexOf(this.operator as GroupOperator) ===
          -1 &&
        this.operator !== Operator.NOT
      )
        return {
          operator: {
            condition: invalidOpMessage,
          },
        } as ModelErrorDefinition;
      // if (this.operator !== Operator.NOT && typeof this.attr1.attr1 !== "string")
      //     return {
      //         attr1: {
      //             condition: stringFormat("Parent condition attribute must be a string")
      //         }
      //     } as ModelErrorDefinition
    }
  }

  /**
   * @summary Joins 2 {@link Condition}s on an {@link Operator#AND} operation
   * @param {Condition} condition1
   * @param {Condition} condition2
   */
  static and<M extends Model>(
    condition1: Condition<M>,
    condition2: Condition<M>
  ): Condition<M> {
    return Condition.group(condition1, GroupOperator.AND, condition2);
  }

  /**
   * @summary Joins 2 {@link Condition}s on an {@link Operator#OR} operation
   * @param {Condition} condition1
   * @param {Condition} condition2
   */
  static or<M extends Model>(
    condition1: Condition<M>,
    condition2: Condition<M>
  ): Condition<M> {
    return Condition.group(condition1, GroupOperator.OR, condition2);
  }

  /**
   * @summary Groups 2 {@link Condition}s by the specified {@link GroupOperator}
   * @param {Condition} condition1
   * @param {GroupOperator} operator
   * @param {Condition} condition2
   */
  private static group<M extends Model>(
    condition1: Condition<M>,
    operator: GroupOperator,
    condition2: Condition<M>
  ): Condition<M> {
    return new Condition(condition1, operator, condition2);
  }

  static attribute<M extends Model>(attr: keyof M) {
    return new Condition.Builder<M>().attribute(attr);
  }

  /**
   * @summary Condition Builder Class
   * @description provides a simple API to build {@link Condition}s
   *
   * @class ConditionBuilder
   * @implements Builder
   * @implements AttributeOption
   *
   * @category Query
   * @subcategory Conditions
   */
  private static Builder = class ConditionBuilder<M extends Model>
    implements ConditionBuilderOption<M>, AttributeOption<M>
  {
    attr1?: keyof M | Condition<M> = undefined;
    operator?: Operator | GroupOperator = undefined;
    comparison?: any = undefined;

    /**
     * @inheritDoc
     */
    attribute(attr: keyof M): AttributeOption<M> {
      this.attr1 = attr;
      return this;
    }

    attr(attr: keyof M) {
      return this.attribute(attr);
    }

    /**
     * @summary Creates an Equality Comparison
     * @param {any} val
     */
    eq(val: any) {
      return this.setOp(Operator.EQUAL, val);
    }

    /**
     * @summary Creates a Different Comparison
     * @param {any} val
     */
    dif(val: any) {
      return this.setOp(Operator.DIFFERENT, val);
    }

    /**
     * @summary Creates a Greater Than Comparison
     * @param {any} val
     */
    gt(val: any) {
      return this.setOp(Operator.BIGGER, val);
    }

    /**
     * @summary Creates a Lower Than Comparison
     * @param {any} val
     */
    lt(val: any) {
      return this.setOp(Operator.SMALLER, val);
    }

    /**
     * @summary Creates a Greater or Equal to Comparison
     * @param {any} val
     */
    gte(val: any) {
      return this.setOp(Operator.BIGGER_EQ, val);
    }

    /**
     * @summary Creates a Lower or Equal to Comparison
     * @param {any} val
     */
    lte(val: any) {
      return this.setOp(Operator.SMALLER_EQ, val);
    }

    in(arr: any[]) {
      return this.setOp(Operator.IN, arr);
    }

    /**
     * @summary Creates a Regexpo Comparison
     * @param {any} val
     */
    regexp(val: any) {
      return this.setOp(Operator.REGEXP, new RegExp(val).source);
    }

    /**
     * @summary Creates an {@link Operator} based Comparison
     * @param {Operator} op
     * @param {any} val
     */
    private setOp(op: Operator, val: any) {
      this.operator = op;
      this.comparison = val;
      return this.build();
    }

    /**
     * @summary Builds the Database Object
     * @throws {QueryError} if it fails to build the {@link Condition}
     * @private
     */
    private build(): Condition<M> {
      try {
        return new Condition(
          this.attr1 as string | Condition<M>,
          this.operator as Operator,
          this.comparison as any
        );
      } catch (e: any) {
        throw new QueryError(e);
      }
    }
  };

  static builder<M extends Model>(): ConditionBuilderOption<M> {
    return new Condition.Builder<M>();
  }
}
