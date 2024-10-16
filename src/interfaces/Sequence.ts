/**
 * @summary Sequence
 *
 * @interface Sequence
 *
 * @category Sequences
 */

export interface Sequence {
  /**
   * @summary generates the next value in the sequence
   *
   * @method
   */
  next(): Promise<string | number | bigint>;
  current(): Promise<string | number | bigint>;
  // range(): Promise<string[] | number[] | bigint[]>;
}
