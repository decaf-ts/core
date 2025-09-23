import { Condition } from "./Condition";
import { OrderBySelector } from "./selectors";

export type QueryOptions = { allowLimit?: boolean; allowOffset?: boolean };

export interface QueryAssist {
  action: "find";
  where: Condition<any>;
  groupBy?: string[];
  orderBy?: OrderBySelector<any>[];
  limit: number | undefined;
  offset: number | undefined;
}

export enum QueryClause {
  FIND_BY = "findBy",
  AND = "And",
  OR = "Or",
  GROUP_BY = "GroupBy",
  ORDER_BY = "OrderBy",
  LIMIT = "Limit",
}

export type OperatorParser = (field: string, ...args: any) => Condition<any>;

export interface FilterDescriptor {
  field: string;
  operator?: string;
}
