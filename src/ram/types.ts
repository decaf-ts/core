import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { Repository } from "../repository";
import { Context, RepositoryFlags } from "@decaf-ts/db-decorators";
import { RamAdapter } from "./RamAdapter";

export type RamStorage = Record<string, Record<string, any>>;

export type RamQuery<M extends Model> = {
  select: undefined | keyof M | (keyof M)[];
  from: string | M | Constructor<M>;
  where: (el: M) => boolean;
  sort?: (el: M, el2: M) => number;
  limit?: number;
  skip?: number;
};

export type RamRepository<M extends Model> = Repository<
  M,
  RamQuery<M>,
  RamAdapter,
  RepositoryFlags,
  Context<RepositoryFlags>
>;
