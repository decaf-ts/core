export enum PersistenceKeys {
  INDEX = "index",
  UNIQUE = "unique",
  ADAPTER = "adapter",
  INJECTABLE = "decaf_{0}_adapter_for_{1}",
  TABLE = "table",
  COLUMN = "column",
  METADATA = "__metadata",
  RELATIONS = "__relations",
  CLAUSE_SEQUENCE = "clause-sequence",
  // Ownership
  CREATED_BY = "ownership.created-by",
  UPDATED_BY = "ownership.updated-by",
  // Relations
  ONE_TO_ONE = "relations.one-to-one",
  ONE_TO_MANY = "relations.one-to-many",
  MANY_TO_ONE = "relations.many-to-one",
  POPULATE = "populate",
}

export enum Roles {
  ADMIN = "admin",
  WRITER = "writer",
  READER = "reader",
}
