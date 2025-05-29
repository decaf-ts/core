import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository";
import { Context, RepositoryFlags } from "@decaf-ts/db-decorators";
import { RamAdapter } from "./RamAdapter";

/**
 * @description In-memory storage structure for the RAM adapter
 * @summary A nested Map structure that stores all entities by their table name and primary key.
 * The outer Map uses table names as keys, while the inner Map uses entity IDs as keys and entity instances as values.
 * @typedef {Map<string, Map<string | number, any>>} RamStorage
 * @memberOf module:core
 * @category Ram
 */
export type RamStorage = Map<string, Map<string | number, any>>;

/**
 * @description Query specification for RAM adapter
 * @summary Defines the structure of a query for retrieving data from the in-memory storage.
 * It specifies what fields to select, which model to query, filtering conditions,
 * sorting criteria, and pagination options.
 * @template M - The model type being queried
 * @typedef {Object} RawRamQuery
 * @property {(keyof M)[] | undefined} select - Fields to select from the model, or undefined for all fields
 * @property {Constructor<M>} from - The model constructor to query
 * @property {function(M): boolean} where - Predicate function for filtering entities
 * @property {function(M, M): number} [sort] - Optional comparator function for sorting results
 * @property {number} [limit] - Optional maximum number of results to return
 * @property {number} [skip] - Optional number of results to skip (for pagination)
 * @memberOf module:core
 * @category Ram
 */
export type RawRamQuery<M extends Model> = {
  select: undefined | (keyof M)[];
  from: Constructor<M>;
  where: (el: M) => boolean;
  sort?: (el: M, el2: M) => number;
  limit?: number;
  skip?: number;
};

/**
 * @description Flags for RAM adapter operations
 * @summary Interface that extends the base repository flags with RAM-specific flags.
 * Contains user identification information needed for tracking entity creation and updates.
 * @interface RamFlags
 * @property {string} UUID - Unique identifier for the current user
 * @memberOf module:core
 * @category Ram
 */
export interface RamFlags extends RepositoryFlags {
  UUID: string;
}

/**
 * @description Type definition for RAM-specific repository
 * @summary A specialized repository type for working with models in the RAM adapter.
 * It combines the model type with RAM-specific query, adapter, flags, and context types.
 * @template M - The model type managed by the repository
 * @typedef {Repository<M, RawRamQuery<any>, RamAdapter, RamFlags, Context<RamFlags>>} RamRepository
 * @memberOf module:core
 * @category Ram
 */
export type RamRepository<M extends Model> = Repository<
  M,
  RawRamQuery<any>,
  RamAdapter,
  RamFlags,
  Context<RamFlags>
>;
