import { CascadeMetadata } from "./types";

/**
 * @description Enumeration of possible sort directions.
 * @summary Defines the available sort directions for ordering query results.
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum OrderDirection {
  /** Ascending order (A to Z, 0 to 9) */
  ASC = "asc",

  /** Descending order (Z to A, 9 to 0) */
  DSC = "desc",
}

/**
 * @description Enumeration of cascade operation types.
 * @summary Defines the available cascade behaviors for entity relationships.
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum Cascade {
  /** Perform cascade operation on related entities */
  CASCADE = "cascade",
  /** Do not perform cascade operation on related entities */
  NONE = "none",
}

/**
 * @description Default cascade configuration for entity relationships.
 * @summary Provides the default cascade behavior where updates cascade but deletes do not.
 * @type {CascadeMetadata}
 * @const DefaultCascade
 * @memberOf module:core
 */
export const DefaultCascade: CascadeMetadata = {
  update: Cascade.CASCADE,
  delete: Cascade.NONE,
};
