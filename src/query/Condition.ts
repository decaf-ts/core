import { AttributeOption, ConditionBuilderOption } from "./options";
import {
  ConditionalAsync,
  Model,
  ModelArg,
  ModelErrorDefinition,
  required,
} from "@decaf-ts/decorator-validation";
import { GroupOperator, Operator } from "./constants";
import { QueryError } from "./errors";

type InferAsync<M> = M extends Model<infer A> ? A : false;

/**
 * @description Represents a logical condition for database queries
 * @summary A class that encapsulates query conditions with support for complex logical operations.
 * This class allows for building and combining query conditions using logical operators (AND, OR, NOT)
 * and comparison operators (equals, not equals, greater than, etc.).
 * @template M - The model type this condition operates on
 * @param {string | Condition<M>} attr1 - The attribute name or a nested condition
 * @param {Operator | GroupOperator} operator - The operator to use for the condition
 * @param {any} comparison - The value to compare against or another condition
 * @class Condition
 * @example
 * // Create a simple condition
 * const nameCondition = Condition.attribute("name").eq("John");
 *
 * // Create a complex condition
 * const complexCondition = Condition.attribute("age").gt(18)
 *   .and(Condition.attribute("status").eq("active"));
 *
 * // Use the builder pattern
 * const userQuery = Condition.builder()
 *   .attribute("email").regexp(".*@example.com")
 *   .and(Condition.attribute("lastLogin").gt(new Date("2023-01-01")));
 * @mermaid
 * sequenceDiagram
 *   participant Dev
 *   participant Condition
 *   Dev->>Condition: builder().attribute("age").gt(18)
 *   Condition-->>Dev: Condition(age > 18)
 *   Dev->>Condition: .and(attribute("status").eq("active"))
 *   Condition-->>Dev: Condition((age > 18) AND (status = "active"))
 */
export class Condition<M extends Model<any>> extends Model<InferAsync<M>> {
  @required()
  protected attr1?: string | Condition<M> = undefined;
  @required()
  protected operator?: Operator | GroupOperator = undefined;
  @required()
  protected comparison?: any = undefined;

  private constructor(arg: ModelArg<Condition<any>>);
  private constructor(
    attr1: string | Condition<M>,
    operator: Operator | GroupOperator,
    comparison: any
  );
  private constructor(
    attr1: string | Condition<M> | ModelArg<Condition<any>>,
    operator?: Operator | GroupOperator,
    comparison?: any
  ) {
    super();
    if (!operator && !comparison) {
      Model.fromModel(this, attr1 as any);
    } else {
      this.attr1 = attr1 as string | Condition<any>;
      this.operator = operator;
      this.comparison = comparison;
    }
  }

  /**
   * @description Combines this condition with another using logical AND
   * @summary Joins two conditions with an AND operator, requiring both to be true
   * @param {Condition<M>} condition - The condition to combine with this one
   * @return {Condition<M>} A new condition representing the AND operation
   */
  and(condition: Condition<M>): Condition<M> {
    return Condition.and(this, condition);
  }

  /**
   * @description Combines this condition with another using logical OR
   * @summary Joins two conditions with an OR operator, requiring at least one to be true
   * @param {Condition<M>} condition - The condition to combine with this one
   * @return {Condition<M>} A new condition representing the OR operation
   */
  or(condition: Condition<M>): Condition<M> {
    return Condition.or(this, condition);
  }

  /**
   * @description Creates a negation condition
   * @summary Excludes a value from the result by applying a NOT operator
   * @param {any} val - The value to negate
   * @return {Condition<M>} A new condition representing the NOT operation
   */
  not(val: any): Condition<M> {
    return new Condition(this, Operator.NOT, val);
  }

  /**
   * @description Validates the condition and checks for errors
   * @summary Extends the base validation to ensure the condition is properly formed
   * @param {...string[]} exceptions - Fields to exclude from validation
   * @return {ModelErrorDefinition | undefined} Error definition if validation fails, undefined otherwise
   */
  override hasErrors(
    ...exceptions: string[]
  ): ConditionalAsync<InferAsync<M>, ModelErrorDefinition | undefined> {
    const conditionCheck = (): ModelErrorDefinition | undefined => {
      const invalidOpMessage = `Invalid operator ${this.operator}}`;

      if (typeof this.attr1 === "string") {
        if (this.comparison instanceof Condition)
          return {
            comparison: {
              condition:
                "Both sides of the comparison must be of the same type",
            },
          } as ModelErrorDefinition;
        if (Object.values(Operator).indexOf(this.operator as Operator) === -1)
          return {
            operator: {
              condition: invalidOpMessage,
            },
          } as ModelErrorDefinition;
        // Validate BETWEEN operator has array with 2 values
        if (this.operator === Operator.BETWEEN) {
          if (
            !Array.isArray(this.comparison) ||
            this.comparison.length !== 2
          ) {
            return {
              comparison: {
                condition:
                  "BETWEEN operator requires an array with exactly 2 values [min, max]",
              },
            } as ModelErrorDefinition;
          }
        }
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
          Object.values(GroupOperator).indexOf(
            this.operator as GroupOperator
          ) === -1 &&
          this.operator !== Operator.NOT
        )
          return {
            operator: {
              condition: invalidOpMessage,
            },
          } as ModelErrorDefinition;
      }
    };

    const errors = super.hasErrors(...exceptions);
    if (!this.isAsync())
      return (
        (errors as ModelErrorDefinition | undefined) ??
        (conditionCheck() as any)
      );

    return (async () => {
      const resolved = await Promise.resolve(
        errors as unknown as Promise<ModelErrorDefinition | undefined>
      );
      return resolved ?? conditionCheck();
    })() as ConditionalAsync<InferAsync<M>, ModelErrorDefinition | undefined>;
  }

  /**
   * @description Creates a new condition that combines two conditions with logical AND
   * @summary Static method that joins two conditions with an AND operator, requiring both to be true
   * @template M - The model type this condition operates on
   * @param {Condition<M>} condition1 - The first condition
   * @param {Condition<M>} condition2 - The second condition
   * @return {Condition<M>} A new condition representing the AND operation
   */
  static and<M extends Model>(
    condition1: Condition<M>,
    condition2: Condition<M>
  ): Condition<M> {
    return Condition.group(condition1, GroupOperator.AND, condition2);
  }

  /**
   * @description Creates a new condition that combines two conditions with logical OR
   * @summary Static method that joins two conditions with an OR operator, requiring at least one to be true
   * @template M - The model type this condition operates on
   * @param {Condition<M>} condition1 - The first condition
   * @param {Condition<M>} condition2 - The second condition
   * @return {Condition<M>} A new condition representing the OR operation
   */
  static or<M extends Model>(
    condition1: Condition<M>,
    condition2: Condition<M>
  ): Condition<M> {
    return Condition.group(condition1, GroupOperator.OR, condition2);
  }

  /**
   * @description Creates a new condition that groups two conditions with a specified operator
   * @summary Private static method that combines two conditions using the specified group operator
   * @template M - The model type this condition operates on
   * @param {Condition<M>} condition1 - The first condition
   * @param {GroupOperator} operator - The group operator to use (AND, OR)
   * @param {Condition<M>} condition2 - The second condition
   * @return {Condition<M>} A new condition representing the grouped operation
   */
  private static group<M extends Model>(
    condition1: Condition<M>,
    operator: GroupOperator,
    condition2: Condition<M>
  ): Condition<M> {
    return new Condition(condition1, operator, condition2);
  }

  /**
   * @description Creates a condition builder for a specific model attribute
   * @summary Static method that initializes a condition builder with the specified attribute
   * @template M - The model type this condition operates on
   * @param attr - The model attribute to build a condition for
   * @return {AttributeOption<M>} A condition builder initialized with the attribute
   */
  static attribute<M extends Model>(attr: keyof M) {
    return new Condition.Builder<M>().attribute(attr);
  }

  /**
   * @description Alias for the attribute method
   * @summary Shorthand method that initializes a condition builder with the specified attribute
   * @template M - The model type this condition operates on
   * @param attr - The model attribute to build a condition for
   * @return {AttributeOption<M>} A condition builder initialized with the attribute
   */
  static attr<M extends Model>(attr: keyof M) {
    return this.attribute(attr);
  }

  /**
   * @description Provides a fluent API to build query conditions
   * @summary A builder class that simplifies the creation of database query conditions
   * with a chainable interface for setting attributes and operators
   * @template M - The model type this condition builder operates on
   * @class ConditionBuilder
   */
  private static Builder = class ConditionBuilder<M extends Model>
    implements ConditionBuilderOption<M>, AttributeOption<M>
  {
    attr1?: keyof M | Condition<M> = undefined;
    operator?: Operator | GroupOperator = undefined;
    comparison?: any = undefined;

    /**
     * @description Sets the attribute for the condition
     * @summary Specifies which model attribute the condition will operate on
     * @param attr - The model attribute to use in the condition
     * @return {AttributeOption<M>} This builder instance for method chaining
     */
    attribute(attr: keyof M): AttributeOption<M> {
      this.attr1 = attr;
      return this;
    }

    /**
     * @description Alias for the attribute method
     * @summary Shorthand method to specify which model attribute the condition will operate on
     * @param attr - The model attribute to use in the condition
     * @return {AttributeOption<M>} This builder instance for method chaining
     */
    attr(attr: keyof M) {
      return this.attribute(attr);
    }

    /**
     * @description Creates an equality condition
     * @summary Builds a condition that checks if the attribute equals the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the equality comparison
     */
    eq(val: any) {
      return this.setOp(Operator.EQUAL, val);
    }

    /**
     * @description Creates an inequality condition
     * @summary Builds a condition that checks if the attribute is different from the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the inequality comparison
     */
    dif(val: any) {
      return this.setOp(Operator.DIFFERENT, val);
    }

    /**
     * @description Creates a greater than condition
     * @summary Builds a condition that checks if the attribute is greater than the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the greater than comparison
     */
    gt(val: any) {
      return this.setOp(Operator.BIGGER, val);
    }

    /**
     * @description Creates a less than condition
     * @summary Builds a condition that checks if the attribute is less than the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the less than comparison
     */
    lt(val: any) {
      return this.setOp(Operator.SMALLER, val);
    }

    /**
     * @description Creates a greater than or equal to condition
     * @summary Builds a condition that checks if the attribute is greater than or equal to the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the greater than or equal comparison
     */
    gte(val: any) {
      return this.setOp(Operator.BIGGER_EQ, val);
    }

    /**
     * @description Creates a less than or equal to condition
     * @summary Builds a condition that checks if the attribute is less than or equal to the specified value
     * @param {any} val - The value to compare the attribute against
     * @return {Condition<M>} A new condition representing the less than or equal comparison
     */
    lte(val: any) {
      return this.setOp(Operator.SMALLER_EQ, val);
    }

    /**
     * @description Creates an inclusion condition
     * @summary Builds a condition that checks if the attribute value is included in the specified array
     * @param {any[]} arr - The array of values to check against
     * @return {Condition<M>} A new condition representing the inclusion comparison
     */
    in(arr: any[]) {
      return this.setOp(Operator.IN, arr);
    }

    /**
     * @description Creates a regular expression condition
     * @summary Builds a condition that checks if the attribute matches the specified regular expression pattern
     * @param {any} val - The regular expression pattern to match against
     * @return {Condition<M>} A new condition representing the regular expression comparison
     */
    regexp(val: any) {
      return this.setOp(Operator.REGEXP, new RegExp(val).source);
    }

    /**
     * @description Creates a between condition
     * @summary Builds a condition that checks if the attribute value is between min and max (inclusive)
     * @param {any} min - The minimum value (inclusive)
     * @param {any} max - The maximum value (inclusive)
     * @return {Condition<M>} A new condition representing the between comparison
     */
    between(min: any, max: any) {
      return this.setOp(Operator.BETWEEN, [min, max]);
    }

    /**
     * @description Sets the operator and comparison value for the condition
     * @summary Private method that configures the condition with the specified operator and value
     * @param {Operator} op - The operator to use for the condition
     * @param {any} val - The value to compare against
     * @return {Condition<M>} A new condition with the specified operator and value
     */
    private setOp(op: Operator, val: any) {
      this.operator = op;
      this.comparison = val;
      return this.build();
    }

    /**
     * @description Constructs a Condition instance from the builder's state
     * @summary Finalizes the condition building process by creating a new Condition instance
     * @throws {QueryError} If the condition cannot be built due to invalid parameters
     * @return {Condition<M>} A new condition instance with the configured attributes
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

  /**
   * @description Creates a new condition builder
   * @summary Factory method that returns a new instance of the condition builder
   * @template M - The model type this condition builder will operate on
   * @return {ConditionBuilderOption<M>} A new condition builder instance
   */
  static builder<M extends Model>(): ConditionBuilderOption<M> {
    return new Condition.Builder<M>();
  }

  static from(obj: ModelArg<Condition<any>>) {
    return new Condition(obj);
  }
}
