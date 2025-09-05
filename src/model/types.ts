import { CascadeMetadata } from "../repository";
import { Constructor } from "@decaf-ts/decorator-validation";

/**
 * Describes join column options.
 */
export type JoinColumnOptions = {
  /**
   * Name of the column.
   */
  name?: string;
  /**
   * Name of the column in the entity to which this column is referenced.
   */
  referencedColumnName?: string;
  /**
   * Name of the foreign key constraint.
   */
  foreignKeyConstraintName?: string;
};

export type JoinTableOptions = {
  /**
   * Name of the table that will be created to store values of the both tables (join table).
   * By default is auto generated.
   */
  name?: string;
  /**
   * First column of the join table.
   */
  joinColumn?: JoinColumnOptions;
  /**
   * Second (inverse) column of the join table.
   */
  inverseJoinColumn?: JoinColumnOptions;
};

export type JoinTableMultipleColumnsOptions = {
  /**
   * Name of the table that will be created to store values of the both tables (join table).
   * By default is auto generated.
   */
  name?: string;
  /**
   * First column of the join table.
   */
  joinColumns?: JoinColumnOptions[];
  /**
   * Second (inverse) column of the join table.
   */
  inverseJoinColumns?: JoinColumnOptions[];
};

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
