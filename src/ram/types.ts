import { Model } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository";
import { Constructor } from "@decaf-ts/decoration";
import { Adapter, AdapterFlags } from "../persistence";
import { Context } from "../persistence/Context";
import { MultiLock } from "@decaf-ts/transactional-decorators";

/**
 * @description In-memory storage structure for the RAM adapter
 * @summary A nested Map structure that stores all entities by their table name and primary key.
 * The outer Map uses table names as keys, while the inner Map uses entity IDs as keys and entity instances as values.
 * @typedef {Map<string, Map<string | number, any>>} RamStorage
 * @memberOf module:core
 * @category Ram
 */
export type RamStorage = Map<string, Map<string | number, any>>;

export type RawRamQuery<M extends Model = any> = {
  select: undefined | (keyof M)[];
  from: Constructor<M>;
  where: (el: M) => boolean;
  sort?: (el: M, el2: M) => number;
  groupBy?: (keyof M)[];
  limit?: number;
  skip?: number;
  count?: keyof M | null;
  countDistinct?: keyof M;
  min?: keyof M;
  max?: keyof M;
  sum?: keyof M;
  avg?: keyof M;
  distinct?: keyof M;
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
export interface RamFlags extends AdapterFlags {
  UUID: string;
}

export type RamRepository<M extends Model<boolean>> = Repository<
  M,
  Adapter<RamConfig, RamStorage, RawRamQuery<any>, RamContext>
>;

export type RamContext = Context<RamFlags>;

export type RamConfig = {
  user: string;
  lock?: MultiLock;
};
