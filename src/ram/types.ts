import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository";
import { Context, RepositoryFlags } from "@decaf-ts/db-decorators";
import { RamAdapter } from "./RamAdapter";

export type RamStorage = Record<string, Record<string, any>>;

export type RawRamQuery<M extends Model> = {
  select: undefined | (keyof M)[];
  from: Constructor<M>;
  where: (el: M) => boolean;
  sort?: (el: M, el2: M) => number;
  limit?: number;
  skip?: number;
};

export interface RamFlags extends RepositoryFlags {
  UUID: string;
}

export type RamRepository<M extends Model> = Repository<
  M,
  RawRamQuery<any>,
  RamAdapter,
  RamFlags,
  Context<RamFlags>
>;
