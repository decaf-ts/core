import {
  Condition,
  GroupOperator,
  Operator,
  Paginator,
  QueryError,
} from "../query";
import { RawRamQuery } from "./types";
import { Model } from "@decaf-ts/decorator-validation";
import { RamPaginator } from "./RamPaginator";
import { InternalError } from "@decaf-ts/db-decorators";
import { Query } from "../query/Query";
import { Reflection } from "@decaf-ts/reflection";
import { RamAdapter } from "./RamAdapter";

export class RamQuery<M extends Model, R> extends Query<RawRamQuery<M>, M, R> {
  constructor(adapter: RamAdapter) {
    super(adapter as any);
  }

  private getSort() {
    return (el1: Model, el2: Model) => {
      if (!this.orderBySelector)
        throw new InternalError(
          "orderBySelector not set. Should be impossible"
        );
      const selector = this.orderBySelector;
      const [key, direction] = selector;
      const type = Reflection.getTypeFromDecorator(el1, key as string);
      if (!type)
        throw new QueryError(`type not compatible with sorting: ${type}`);

      switch (type) {
        case "string":
        case "String":
          return (
            (direction === "asc" ? 1 : -1) *
            (el1[key as keyof Model] as unknown as string).localeCompare(
              el2[key as keyof Model] as unknown as string
            )
          );
        case "number":
        case "Number":
          return (
            (direction === "asc" ? 1 : -1) *
            ((el1[key as keyof Model] as unknown as number) -
              (el2[key as keyof Model] as unknown as number))
          );
        case "object":
        case "Object":
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
  }

  protected build(): RawRamQuery<M> {
    const result: RawRamQuery<M> = {
      select: this.selectSelector,
      from: this.fromSelector,
      where: this.whereCondition
        ? this.parseCondition(this.whereCondition).where
        : // eslint-disable-next-line @typescript-eslint/no-unused-vars
          (el: M) => {
            return true;
          },
      limit: this.limitSelector,
      skip: this.offsetSelector,
    };
    if (this.orderBySelector) result.sort = this.getSort();
    return result;
  }

  async paginate(size: number): Promise<Paginator<R, RawRamQuery<M>>> {
    try {
      const query = this.build();
      return new RamPaginator<R, M>(this.adapter, query, size);
    } catch (e: any) {
      throw new InternalError(e);
    }
  }

  parseCondition<M extends Model>(condition: Condition<M>): RawRamQuery<M> {
    return {
      where: (m: Model) => {
        const { attr1, operator, comparison } = condition as unknown as {
          attr1: string | Condition<M>;
          operator: Operator | GroupOperator;
          comparison: any;
        };

        if (
          [GroupOperator.AND, GroupOperator.OR, Operator.NOT].indexOf(
            operator as GroupOperator
          ) === -1
        ) {
          switch (operator) {
            case Operator.BIGGER:
              return m[attr1 as keyof Model] > comparison;
            case Operator.BIGGER_EQ:
              return m[attr1 as keyof Model] >= comparison;
            case Operator.DIFFERENT:
              return m[attr1 as keyof Model] !== comparison;
            case Operator.EQUAL:
              return m[attr1 as keyof Model] === comparison;
            case Operator.REGEXP:
              if (typeof m[attr1 as keyof Model] !== "string")
                throw new QueryError(
                  `Invalid regexp comparison on a non string attribute: ${m[attr1 as keyof Model]}`
                );
              return !!(m[attr1 as keyof Model] as unknown as string).match(
                new RegExp(comparison, "g")
              );
            case Operator.SMALLER:
              return m[attr1 as keyof Model] < comparison;
            case Operator.SMALLER_EQ:
              return m[attr1 as keyof Model] <= comparison;
            default:
              throw new InternalError(
                `Invalid operator for standard comparisons: ${operator}`
              );
          }
        } else if (operator === Operator.NOT) {
          throw new InternalError("Not implemented");
        } else {
          const op1: RawRamQuery<any> = this.parseCondition(
            attr1 as Condition<M>
          );
          const op2: RawRamQuery<any> = this.parseCondition(
            comparison as Condition<M>
          );
          switch (operator) {
            case GroupOperator.AND:
              return op1.where(m) && op2.where(m);
            case GroupOperator.OR:
              return op1.where(m) || op2.where(m);
            default:
              throw new InternalError(
                `Invalid operator for And/Or comparisons: ${operator}`
              );
          }
        }
      },
    } as RawRamQuery<any>;
  }
}
