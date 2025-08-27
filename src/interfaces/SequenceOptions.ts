/**
 * @description Interface for sequence configuration options
 * @summary Defines the configuration options for creating and managing sequences
 * @interface SequenceOptions
 * @memberOf module:core
 */
export interface SequenceOptions<TYPE = "Number" | "BigInt" | undefined> {
  /**
   * @description Optional name for the sequence
   * @summary A unique identifier for the sequence
   */
  name?: string;

  generated?: boolean;

  /**
   * @description The data type of the sequence
   * @summary Specifies whether the sequence generates Number or BigInt values
   */
  type: TYPE;

  /**
   * @description The initial value of the sequence
   * @summary The value that the sequence starts with
   */
  startWith: number;

  /**
   * @description The increment value for each step in the sequence
   * @summary The amount by which the sequence increases with each call
   */
  incrementBy: number;

  /**
   * @description Optional minimum value for the sequence
   * @summary The lowest value that the sequence can generate
   */
  minValue?: number;

  /**
   * @description Optional maximum value for the sequence
   * @summary The highest value that the sequence can generate
   */
  maxValue?: number;

  /**
   * @description Whether the sequence should cycle when reaching its limits
   * @summary If true, the sequence will restart from minValue when reaching maxValue
   */
  cycle: boolean;
}

/**
 * @description Default options for sequences
 * @summary Provides a standard configuration for number sequences starting at 0 and incrementing by 1
 * @const NoneSequenceOptions
 * @memberOf module:core
 */
export const NoneSequenceOptions: SequenceOptions = {
  type: undefined,
  generated: false,
  startWith: 0,
  incrementBy: 1,
  cycle: false,
};

/**
 * @description Default options for sequences
 * @summary Provides a standard configuration for number sequences starting at 0 and incrementing by 1
 * @const DefaultSequenceOptions
 * @memberOf module:core
 */
export const DefaultSequenceOptions: SequenceOptions = NoneSequenceOptions;

/**
 * @description Predefined options for numeric sequences
 * @summary Configuration for standard number sequences starting at 0 and incrementing by 1
 * @const NumericSequence
 * @memberOf module:core
 */
export const NumericSequence: SequenceOptions = {
  type: "Number",
  generated: true,
  startWith: 0,
  incrementBy: 1,
  cycle: false,
};

/**
 * @description Predefined options for BigInt sequences
 * @summary Configuration for BigInt sequences starting at 0 and incrementing by 1
 * @const BigIntSequence
 * @memberOf module:core
 */
export const BigIntSequence: SequenceOptions = Object.assign(
  {},
  NumericSequence,
  {
    type: "BigInt",
  }
);
