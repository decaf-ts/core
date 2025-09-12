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
 * @description Shape of the default cascade configuration object used in repositories.
 * @summary Documents the structure of the cascade configuration with explicit update and delete behaviors.
 * @property {'cascade'|'none'} update - Determines whether updates cascade to related entities.
 * @property {'cascade'|'none'} delete - Determines whether deletes cascade to related entities.
 * @typeDef DefaultCascadeConfig
 * @memberOf module:core
 */
export const DefaultCascade: CascadeMetadata = {
  update: Cascade.CASCADE,
  delete: Cascade.NONE,
};
