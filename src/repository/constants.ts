import { CascadeMetadata } from "./types";

/**
 * @summary defines order directions when sorting
 *
 * @constant OrderDirection
 *
 * @category Query
 */
export enum OrderDirection {
  /**
   * @summary Defines the sort order as ascending
   * @prop ASC
   */
  ASC = "asc",
  /**
   * @summary Defines the sort order as descending
   * @property {string} DSC
   */
  DSC = "desc",
}

export enum Cascade {
  CASCADE = "cascade",
  NONE = "none",
}

export const DefaultCascade: CascadeMetadata = {
  update: Cascade.CASCADE,
  delete: Cascade.NONE,
};
