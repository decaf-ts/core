/**
 * @summary Sequence
 *
 * @interface Sequence
 *
 * @category Sequences
 */
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { sequenceNameForModel } from "../identity/utils";
import { SequenceOptions } from "../interfaces/SequenceOptions";

export abstract class Sequence {
  protected constructor(protected readonly options: SequenceOptions) {}

  /**
   * @summary generates the next value in the sequence
   *
   * @method
   */
  abstract next(): Promise<string | number | bigint>;
  abstract current(): Promise<string | number | bigint>;
  abstract range(count: number): Promise<(number | string | bigint)[]>;

  static pk<M extends Model>(model: M | Constructor<M>) {
    return sequenceNameForModel(model, "pk");
  }
}
