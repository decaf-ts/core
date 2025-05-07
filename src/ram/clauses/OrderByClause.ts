import { RamQuery } from "../types";
import { OrderByClause, OrderBySelector, QueryError } from "../../query";
import { Model, ModelArg } from "@decaf-ts/decorator-validation";
import { Reflection } from "@decaf-ts/reflection";

export class RamOrderByClause extends OrderByClause<RamQuery<any>> {
  constructor(clause: ModelArg<OrderByClause<RamQuery<any>>>) {
    super(clause);
  }

  build(query: RamQuery<any>): RamQuery<any> {
    query.sort = (el1: Model, el2: Model) => {
      const selectors = this.selector as OrderBySelector[];
      const [key, direction] = selectors[0];
      const type = Reflection.getTypeFromDecorator(el1, key);
      if (!type)
        throw new QueryError(`type not compatible with sorting: ${type}`);

      switch (type) {
        case "string":
          return (
            (direction === "asc" ? 1 : -1) *
            (el1[key as keyof Model] as unknown as string).localeCompare(
              el2[key as keyof Model] as unknown as string
            )
          );
        case "number":
          return (
            (direction === "asc" ? 1 : -1) *
            ((el1[key as keyof Model] as unknown as number) -
              (el2[key as keyof Model] as unknown as number))
          );
        case "object":
          if (
            el1[key as keyof Model] instanceof Date &&
            el2[key as keyof Model] instanceof Date
          )
            return (
              (direction === "asc" ? 1 : -1) *
              ((el1[key as keyof Model] as unknown as Date).valueOf() -
                (el2[key as keyof Model] as unknown as Date).valueOf())
            );
          throw new QueryError(`Sorting not supported for not date classes`);
        default:
          throw new QueryError(`sorting not supported for type ${type}`);
      }
    };
    return query;
  }
}
