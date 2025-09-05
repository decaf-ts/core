import { Cascade, OrderDirection } from "./constants";

/**
 * @description Metadata for cascade operations on related entities.
 * @summary Defines how update and delete operations should cascade to related entities.
 * @typedef CascadeMetadata
 * @property {Cascade} update - Determines cascade behavior for update operations.
 * @property {Cascade} delete - Determines cascade behavior for delete operations.
 * @memberOf module:core
 */
export type CascadeMetadata = {
  update: Cascade;
  delete: Cascade;
};

export type IndexMetadata = {
  name?: string;
  directions?: OrderDirection[2];
  compositions?: string[];
};

/**
 * @description Metadata for a named index that extends IndexMetadata.
 * @summary Extends IndexMetadata with a suffix to identify the index.
 * @typedef NamedIndexMetadata
 * @property {string} suffix - The suffix to append to the index name.
 * @memberOf module:core
 */
export type NamedIndexMetadata = IndexMetadata & {
  suffix: string;
};
