import { Condition } from "./Condition";
import { OperatorParser } from "./types";

export const OperatorsMap: Record<string, OperatorParser> = {
  Equals: (f, v) => Condition.attribute(f).eq(v),
  Diff: (f, v) => Condition.attribute(f).dif(v),
  LessThan: (f, v) => Condition.attribute(f).lt(v),
  LessThanEqual: (f, v) => Condition.attribute(f).lte(v),
  GreaterThan: (f, v) => Condition.attribute(f).gt(v),
  GreaterThanEqual: (f, v) => Condition.attribute(f).gte(v),
  Between: (f, v1, v2) =>
    Condition.attribute(f).gte(v1).and(Condition.attribute(f).lte(v2)),
  In: (f, v) => Condition.attribute(f).in(v),
  Matches: (f, v) => Condition.attribute(f).regexp(v),
};
