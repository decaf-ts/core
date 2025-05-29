/**
 * @description Persistence-related constant keys
 * @summary Enum containing string constants used throughout the persistence layer for metadata, relations, and other persistence-related operations
 * @enum {string}
 * @readonly
 * @memberOf module:core
 */
export enum PersistenceKeys {
  /** @description Key for index metadata */
  INDEX = "index",

  /** @description Key for unique constraint metadata */
  UNIQUE = "unique",

  /** @description Key for adapter metadata */
  ADAPTER = "adapter",

  /** @description Template for injectable adapter names */
  INJECTABLE = "decaf_{0}_adapter_for_{1}",

  /** @description Key for table name metadata */
  TABLE = "table",

  /** @description Key for column name metadata */
  COLUMN = "column",

  /** @description Key for general metadata storage */
  METADATA = "__metadata",

  /** @description Key for relations metadata storage */
  RELATIONS = "__relations",

  /** @description Key for clause sequence metadata */
  CLAUSE_SEQUENCE = "clause-sequence",

  // Ownership
  /** @description Key for created-by ownership metadata */
  CREATED_BY = "ownership.created-by",

  /** @description Key for updated-by ownership metadata */
  UPDATED_BY = "ownership.updated-by",

  // Relations
  /** @description Key for one-to-one relation metadata */
  ONE_TO_ONE = "relations.one-to-one",

  /** @description Key for one-to-many relation metadata */
  ONE_TO_MANY = "relations.one-to-many",

  /** @description Key for many-to-one relation metadata */
  MANY_TO_ONE = "relations.many-to-one",

  /** @description Key for populate metadata */
  POPULATE = "populate",
}
