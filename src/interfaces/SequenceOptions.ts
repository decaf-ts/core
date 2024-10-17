/**
 * @typedef SequenceOptions
 *
 * @prop {string | number} [startingValue] defines the starting value when sequence doest not exist
 *
 * @category Sequences
 */
export interface SequenceOptions {
  name?: string;
  type: "Number" | "BigInt" | undefined;
  startWith: number;
  incrementBy: number;
  minValue?: number;
  maxValue?: number;
  cycle: boolean;
}

export const DefaultSequenceOptions: SequenceOptions = {
  type: "Number",
  startWith: 0,
  incrementBy: 1,
  cycle: false,
};

export const NumericSequence: SequenceOptions = {
  type: "Number",
  startWith: 0,
  incrementBy: 1,
  cycle: false,
};

export const BigIntSequence: SequenceOptions = {
  type: "BigInt",
  startWith: 0,
  incrementBy: 1,
  cycle: false,
};
