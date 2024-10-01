/**
 * @summary Standard Builder APi for the Builder design pattern
 * @description Expose the build method
 *
 * @interface Builder
 *
 * @category Construction
 */
export interface Builder<T> {
  /**
   * @summary Build the Object
   *
   * @method
   */
  build(...args: any[]): T;
}
