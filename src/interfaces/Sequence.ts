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
  next(): Promise<string | number>;
  current(): Promise<string | number>;
}
