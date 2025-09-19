import { Condition } from "./Condition";
import { OperatorParser } from "./types";

export const OperatorsMap: Record<string, OperatorParser> = {
  Equals: (f, v) => Condition.attribute(f).eq(v),
  Is: (f, v) => Condition.attribute(f).eq(v),
  GreaterThan: (f, v) => Condition.attribute(f).gt(v),
  GreaterThanEqual: (f, v) => Condition.attribute(f).gte(v),
  LessThan: (f, v) => Condition.attribute(f).lt(v),
  LessThanEqual: (f, v) => Condition.attribute(f).lte(v),
  True: (f) => Condition.attribute(f).eq(true),
  False: (f) => Condition.attribute(f).eq(false),
  In: (f, v) => Condition.attribute(f).in(v),
};
