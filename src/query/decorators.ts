import { QueryOptions } from "./types";
import { MethodQueryBuilder } from "./MethodQueryBuilder";

export function query(options: QueryOptions = {}) {
  // return (target: any, propertyKey: any, descriptor: PropertyDescriptor) => {
  return (target: any, propertyKey: any, descriptor: any) => {
    // const originalMethod = descriptor.value;
    const methodName = propertyKey.toString();
    descriptor.value = function (...args: any[]) {
      const { action, where, groupBy, orderBy, limit } =
        MethodQueryBuilder.build(methodName, ...args);

      //   select: undefined | (keyof M)[];
      //   from: Constructor<M>;
      //   where: Condition
      //   sort?: []
      //   limit?: number;
      //   skip?: number;
      let stmt = (this as any).select() as any;
      if (where) stmt = stmt.where(where);
      if (limit) stmt = stmt.limit(limit);
      if (orderBy) stmt = stmt.orderBy(orderBy[0]);
      // if (offset) stmt = stmt.orderBy(orderBy[0]);
      return stmt.execute();
    };
  };
}
