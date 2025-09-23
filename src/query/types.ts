import { Condition } from "./Condition";
import { OrderBySelector } from "./selectors";

export type QueryOptions = {
  allowLimit?: boolean;
  allowOffset?: boolean;
  allowOrderBy?: boolean;
  throwIfNotAllowed?: boolean;
};

export interface QueryAssist {
  action: "find";
  select: undefined | string[];
  where: Condition<any>;
  groupBy?: string[];
  orderBy?: OrderBySelector<any>[];
  limit: number | undefined;
  offset: number | undefined;
}

export enum QueryClause {
  FIND_BY = "findBy",
  SELECT = "Select",
  AND = "And",
  OR = "Or",
  GROUP_BY = "GroupBy",
  ORDER_BY = "OrderBy",
  THEN = "Then",
}

export type OperatorParser = (field: string, ...args: any) => Condition<any>;

export interface FilterDescriptor {
  field: string;
  operator?: string;
}
