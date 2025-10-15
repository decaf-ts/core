import { RamSequenceModel } from "./model/RamSequenceModel";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { Sequence } from "../persistence";
import { SequenceOptions } from "../interfaces";
import { RamAdapter } from "./RamAdapter";
import { Repo, Repository } from "../repository";

/**
 * @description RAM-specific sequence implementation
 * @summary Extends the base Sequence class to provide auto-incrementing sequence functionality
 * for the RAM adapter. This class manages sequences stored in memory, allowing for the generation
 * of sequential identifiers for entities.
 * @param {SequenceOptions} options - Configuration options for the sequence
 * @param {RamAdapter} adapter - The RAM adapter instance to use for storage
 * @class RamSequence
 * @category Ram
 * @example
 * ```typescript
 * // Create a new numeric sequence starting at 1
 * const sequence = new RamSequence({
 *   name: 'order_sequence',
 *   type: 'Number',
 *   startWith: 1,
 *   incrementBy: 1
 * }, ramAdapter);
 *
 * // Get the next value in the sequence
 * const nextId = await sequence.next();
 *
 * // Get a range of values
 * const idRange = await sequence.range(5); // Returns 5 sequential values
 * ```
 */
export class RamSequence extends Sequence {
  protected repo: Repo<RamSequenceModel>;

  constructor(options: SequenceOptions, adapter: RamAdapter) {
    super(options);
    this.repo = Repository.forModel(RamSequenceModel, adapter.alias);
  }

  /**
   * @description Retrieves the current value of the sequence
   * @summary Gets the current value of the sequence from storage. If the sequence
   * doesn't exist yet, it returns the configured starting value.
   * @return A promise that resolves to the current sequence value
   */
  async current(): Promise<string | number | bigint> {
    const { name, startWith } = this.options;
    try {
      const sequence: RamSequenceModel = await this.repo.read(name as string);
      return this.parse(sequence.current as string | number);
    } catch (e: any) {
      if (e instanceof NotFoundError) {
        if (typeof startWith === "undefined")
          throw new InternalError(
            "Starting value is not defined for a non existing sequence"
          );
        try {
          return this.parse(startWith);
        } catch (e: any) {
          throw new InternalError(
            `Failed to parse initial value for sequence ${startWith}: ${e}`
          );
        }
      }
      throw new InternalError(
        `Failed to retrieve current value for sequence ${name}: ${e}`
      );
    }
  }

  /**
   * @description Parses a value according to the sequence type
   * @summary Converts a value to the appropriate type for the sequence (string, number, or bigint)
   * using the base Sequence class's parseValue method.
   * @param {string | number | bigint} value - The value to parse
   * @return {string | number | bigint} The parsed value in the correct type
   */
  private parse(value: string | number | bigint): string | number | bigint {
    return Sequence.parseValue(this.options.type, value);
  }

  /**
   * @description Increments the sequence value
   * @summary Increases the current sequence value by the specified amount and persists
   * the new value to storage. This method handles both numeric and BigInt sequence types.
   * @param {string | number | bigint} current - The current value of the sequence
   * @param {number} [count] - Optional amount to increment by, defaults to the sequence's incrementBy value
   * @return A promise that resolves to the new sequence value after incrementing
   */
  private async increment(
    current: string | number | bigint,
    count?: number
  ): Promise<string | number | bigint> {
    const { type, incrementBy, name } = this.options;
    let next: string | number | bigint;
    const toIncrementBy = count || incrementBy;
    if (toIncrementBy % incrementBy !== 0)
      throw new InternalError(
        `Value to increment does not consider the incrementBy setting: ${incrementBy}`
      );
    switch (type) {
      case "Number":
        next = (this.parse(current) as number) + toIncrementBy;
        break;
      case "BigInt":
        next = (this.parse(current) as bigint) + BigInt(toIncrementBy);
        break;
      case "String":
        next = this.parse(current);
        break;
      default:
        throw new InternalError("Should never happen");
    }
    let seq: RamSequenceModel;
    const repo = this.repo.override({
      ignoredValidationProperties: ["updatedOn"],
    });
    try {
      seq = await repo.update(new RamSequenceModel({ id: name, current: next }));
    } catch (e: any) {
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
      seq = await repo.create(new RamSequenceModel({ id: name, current: next }));
    }

    return seq.current as string | number | bigint;
  }

  /**
   * @description Gets the next value in the sequence
   * @summary Retrieves the current value of the sequence and increments it by the
   * configured increment amount. This is the main method used to get a new sequential value.
   * @return A promise that resolves to the next value in the sequence
   */
  async next(): Promise<number | string | bigint> {
    const current = await this.current();
    return this.increment(current);
  }

  /**
   * @description Generates a range of sequential values
   * @summary Retrieves a specified number of sequential values from the sequence.
   * This is useful when you need to allocate multiple IDs at once.
   * The method increments the sequence by the total amount needed and returns all values in the range.
   * @param {number} count - The number of sequential values to generate
   * @return A promise that resolves to an array of sequential values
   */
  async range(count: number): Promise<(number | string | bigint)[]> {
    const current = (await this.current()) as number;
    const incrementBy = this.parse(
      this.options.incrementBy as number
    ) as number;
    const next: string | number | bigint = await this.increment(
      current,
      (this.parse(count) as number) * incrementBy
    );
    const range: (number | string | bigint)[] = [];
    for (let i: number = 1; i <= count; i++) {
      range.push(current + incrementBy * (this.parse(i) as number));
    }
    if (range[range.length - 1] !== next && this.options.type !== "String")
      throw new InternalError("Miscalculation of range");
    return range;
  }
}
