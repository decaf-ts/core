import { CascadeMetadata } from "../repository";
import { Constructor } from "@decaf-ts/decorator-validation";

export type JoinTableOptions = Record<string, any>;

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
  class: string | (() => Constructor<any>);
  cascade: CascadeMetadata;
  populate: boolean;
  name?: string;
  joinTable?: JoinTableOptions;
};
