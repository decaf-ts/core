import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { sequenceNameForModel } from "../identity/utils";
import { SequenceOptions } from "../interfaces/SequenceOptions";
import { Logger, Logging } from "@decaf-ts/logging";
import { UnsupportedError } from "./errors";

/**
 * @description Abstract base class for sequence generation
 * @summary Provides a framework for generating sequential values (like primary keys) in the persistence layer.
 * Implementations of this class handle the specifics of how sequences are stored and incremented in different
 * database systems.
 * @param {SequenceOptions} options - Configuration options for the sequence generator
 * @class Sequence
 * @example
 * ```typescript
 * // Example implementation for a specific database
 * class PostgresSequence extends Sequence {
 *   constructor(options: SequenceOptions) {
 *     super(options);
 *   }
 *
 *   async next(): Promise<number> {
 *     // Implementation to get next value from PostgreSQL sequence
 *     const result = await this.options.executor.raw(`SELECT nextval('${this.options.name}')`);
 *     return parseInt(result.rows[0].nextval);
 *   }
 *
 *   async current(): Promise<number> {
 *     // Implementation to get current value from PostgreSQL sequence
 *     const result = await this.options.executor.raw(`SELECT currval('${this.options.name}')`);
 *     return parseInt(result.rows[0].currval);
 *   }
 *
 *   async range(count: number): Promise<number[]> {
 *     // Implementation to get a range of values
 *     const values: number[] = [];
 *     for (let i = 0; i < count; i++) {
 *       values.push(await this.next());
 *     }
 *     return values;
 *   }
 * }
 *
 * // Usage
 * const sequence = new PostgresSequence({
 *   name: 'user_id_seq',
 *   executor: dbExecutor
 * });
 *
 * const nextId = await sequence.next();
 * ```
 */
export abstract class Sequence {
  /**
   * @description Logger instance for this sequence
   * @summary Lazily initialized logger for the sequence instance
   */
  private logger!: Logger;

  /**
   * @description Accessor for the logger instance
   * @summary Gets or initializes the logger for this sequence
   * @return {Logger} The logger instance
   */
  protected get log(): Logger {
    if (!this.logger) this.logger = Logging.for(this as any);
    return this.logger;
  }

  /**
   * @description Creates a new sequence instance
   * @summary Protected constructor that initializes the sequence with the provided options
   */
  protected constructor(protected readonly options: SequenceOptions) {}

  /**
   * @description Gets the next value in the sequence
   * @summary Retrieves the next value from the sequence, incrementing it in the process
   * @return A promise that resolves to the next value in the sequence
   */
  abstract next(): Promise<string | number | bigint>;

  /**
   * @description Gets the current value of the sequence
   * @summary Retrieves the current value of the sequence without incrementing it
   * @return A promise that resolves to the current value in the sequence
   */
  abstract current(): Promise<string | number | bigint>;

  /**
   * @description Gets a range of sequential values
   * @summary Retrieves multiple sequential values at once, which can be more efficient than calling next() multiple times
   * @param {number} count - The number of sequential values to retrieve
   * @return A promise that resolves to an array of sequential values
   */
  abstract range(count: number): Promise<(number | string | bigint)[]>;

  /**
   * @description Gets the primary key sequence name for a model
   * @summary Utility method that returns the standardized sequence name for a model's primary key
   * @template M - The model type
   * @param {M|Constructor<M>} model - The model instance or constructor
   * @return {string} The sequence name for the model's primary key
   */
  static pk<M extends Model>(model: M | Constructor<M>) {
    return sequenceNameForModel(model, "pk");
  }

  /**
   * @description Parses a sequence value to the appropriate type
   * @summary Converts a sequence value to the specified type (Number or BigInt)
   * @param {"Number"|"BigInt"|undefined} type - The target type to convert to
   * @param {string|number|bigint} value - The value to convert
   * @return {string|number|bigint} The converted value
   */
  static parseValue(
    type: "Number" | "BigInt" | string | undefined,
    value: string | number | bigint
  ): string | number | bigint {
    switch (type) {
      case "Number":
        return typeof value === "string"
          ? parseInt(value)
          : typeof value === "number"
            ? value
            : BigInt(value);
      case "BigInt":
        return BigInt(value);
      case undefined:
        return value;
      default:
        throw new UnsupportedError(
          `Unsupported sequence type: ${type} for adapter ${this}`
        );
    }
  }
}
