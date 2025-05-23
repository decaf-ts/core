import { OrderDirection } from "../repository";
import { Constructor, Model } from "@decaf-ts/decorator-validation";

export type FromSelector<M extends Model> = Constructor<M> | string;

export type GroupBySelector<M extends Model> = keyof M;

export type OrderBySelector<M extends Model> = [keyof M, OrderDirection];

export type LimitSelector = number;

export type OffsetSelector = number;

export type SelectSelector<M extends Model> = keyof M;
