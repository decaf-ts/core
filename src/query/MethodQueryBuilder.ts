import { Condition, OrderBySelector } from "../query";
import { OrderDirection } from "../repository/constants";
import { FilterDescriptor, QueryAssist, QueryClause } from "./types";
import { OperatorsMap } from "./utils";

const lowerFirst = (str: string): string =>
  str.charAt(0).toLowerCase() + str.slice(1);

export class MethodQueryBuilder {
  static build(methodName: string, ...values: any[]): QueryAssist {
    if (!methodName.startsWith(QueryClause.FIND_BY)) {
      throw new Error(`Unsupported method ${methodName}`);
    }

    const core = this.extractCore(methodName);
    const groupBy = this.extractGroupBy(methodName);
    const orderBy = this.extractOrderBy(methodName);
    const where = this.buildWhere(core, values);
    const limit = this.extractLimit(core, values);

    return {
      action: "find",
      where,
      groupBy,
      orderBy,
      limit,
    };
  }

  private static extractCore(methodName: string): string {
    return methodName.substring(QueryClause.FIND_BY.length);
  }

  private static extractGroupBy(methodName: string): string[] | undefined {
    const groupByIndex = methodName.indexOf(QueryClause.GROUP_BY);
    if (groupByIndex === -1) return undefined;

    const after = methodName.substring(
      groupByIndex + QueryClause.GROUP_BY.length
    );
    const groupByPart = after.split(QueryClause.ORDER_BY)[0];
    return groupByPart.split("ThenBy").map(lowerFirst).filter(Boolean);
  }

  private static extractOrderBy(
    methodName: string
  ): OrderBySelector<any>[] | undefined {
    const orderByIndex = methodName.indexOf(QueryClause.ORDER_BY);
    if (orderByIndex === -1) return undefined;

    const after = methodName.substring(
      orderByIndex + QueryClause.ORDER_BY.length
    );
    const orderParts = after.split("ThenBy");

    return orderParts.map((part) => {
      const match = part.match(/(.*?)(Asc|Desc|Dsc)$/);
      if (!match) throw new Error(`Invalid OrderBy part: ${part}`);
      const [, field, dir] = match;
      return [
        lowerFirst(field),
        dir.toLowerCase() === "dsc"
          ? OrderDirection.DSC
          : (dir.toLowerCase() as OrderDirection),
      ];
    });
  }

  private static buildWhere(core: string, values: any[]): Condition<any> {
    const parts = core.split(/OrderBy|GroupBy/)[0] || "";
    const conditions = parts.split(/And|Or/);

    const operators = core.match(/And|Or/g) || [];

    let where: Condition<any> | undefined;

    conditions.forEach((token, idx) => {
      const { field, operator } = this.parseFieldAndOperator(token);
      const parser = operator ? OperatorsMap[operator] : OperatorsMap.Equals;
      if (!parser) throw new Error(`Unsupported operator ${operator}`);

      const conditionValue = values[idx];
      if (typeof conditionValue === "undefined") {
        throw new Error(`Invalid value for field ${field}`);
      }

      const condition = parser(field, conditionValue);
      where =
        idx === 0
          ? condition
          : operators[idx - 1] === QueryClause.AND
            ? where!.and(condition)
            : where!.or(condition);
    });

    if (!where) throw new Error("No conditions found in method name");
    return where;
  }

  private static parseFieldAndOperator(str: string): FilterDescriptor {
    for (const operator of Object.keys(OperatorsMap)) {
      if (str.endsWith(operator)) {
        const field = str.slice(0, -operator.length);
        return { field: lowerFirst(field), operator };
      }
    }
    return { field: lowerFirst(str) };
  }

  private static extractLimit(core: string, values: any[]): number | undefined {
    if (
      values.length === core.split(/And|Or/).length + 1 &&
      typeof values[values.length - 1] === "number"
    ) {
      return values[values.length - 1];
    }
    return undefined;
  }
}
