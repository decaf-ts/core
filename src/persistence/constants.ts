import { DefaultRepositoryFlags } from "@decaf-ts/db-decorators";
import { AdapterFlags } from "./types";

/**
 * @description Persistence-related constant keys
 * @summary Enum containing string constants used throughout the persistence layer for metadata, relations, and other persistence-related operations
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum PersistenceKeys {
  PERSISTENCE = "persistence",
  /** @description Key for index metadata */
  INDEX = "index",

  /** @description Key for unique constraint metadata */
  UNIQUE = "unique",

  /** @description Key for adapter metadata */
  ADAPTER = "adapter",

  /** @description Template for injectable adapter names */
  INJECTABLE = "decaf_{0}_adapter_for_{1}",

  SERVICE = "service",
  /** @description Key for table name metadata */
  TABLE = "table",

  /** @description Key for column name metadata */
  COLUMN = "column",

  /** @description Key for general metadata storage */
  METADATA = "__metadata",

  // Ownership
  /** @description Key for created-by ownership metadata */
  OWNERSHIP = "ownership",

  /** @description Key for created-by ownership metadata */
  CREATED_BY = `${OWNERSHIP}.created-by`,

  /** @description Key for updated-by ownership metadata */
  UPDATED_BY = `${OWNERSHIP}.updated-by`,

  // Relations

  /** @description Key for relations metadata storage */
  RELATIONS = "__relations",

  /** @description Key for relations metadata storage */
  RELATION = "relation",

  /** @description Key for one-to-one relation metadata */
  ONE_TO_ONE = `${RELATION}.one-to-one`,

  /** @description Key for one-to-many relation metadata */
  ONE_TO_MANY = `${RELATION}.one-to-many`,

  /** @description Key for many-to-one relation metadata */
  MANY_TO_ONE = `${RELATION}.many-to-one`,
  /** @description Key for many-to-one relation metadata */
  MANY_TO_MANY = `${RELATION}.many-to-many`,

  /** @description Key for populate metadata */
  POPULATE = "populate",
  /** @description Key for populate metadata */
  NO_VALIDATE = "no-validate",
  /** @description Key for migration classes */
  MIGRATION = "migration",

  STATEMENT = "statement",

  QUERY = "query",

  UUID = "uuid",

  INITIALIZATION = "initialization",
}

export const DefaultAdapterFlags: AdapterFlags = Object.assign(
  {},
  DefaultRepositoryFlags,
  {
    enforceUpdateValidation: true,
    allowRawStatements: true,
    forcePrepareSimpleQueries: false,
    forcePrepareComplexQueries: false,
    cacheForPopulate: {},
    observeFullResult: true,
    paginateByBookmark: false,
    dryRun: false,
  }
) as AdapterFlags;
