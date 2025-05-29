import { CascadeMetadata } from "../repository";

/**
 * @description Metadata for model relationships
 * @summary Type definition for storing metadata about relationships between models
 * @property {string} class - The name of the related model class
 * @property {CascadeMetadata} cascade - Configuration for cascade operations (create, update, delete)
 * @property {boolean} populate - Whether to automatically populate the relationship when retrieving the model
 * @typedef {Object} RelationsMetadata
 * @memberOf module:model
 */
export type RelationsMetadata = {
  class: string;
  cascade: CascadeMetadata;
  populate: boolean;
};
