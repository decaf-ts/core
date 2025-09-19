import { QueryOptions } from "./types";
import { MethodQueryBuilder } from "./MethodQueryBuilder";

export function query(options: QueryOptions = {}) {
  return (target: any, propertyKey: any, descriptor: PropertyDescriptor) => {
    // const originalMethod = descriptor.value;
    const methodName = propertyKey.toString();
    descriptor.value = function (...args: any[]) {
      const { where, groupBy, orderBy, limit, offset } =
        MethodQueryBuilder.build(methodName, ...args);

      let stmt = (this as any).select() as any;
      if (where) stmt = stmt.where(where);
      if (orderBy) stmt = stmt.orderBy(orderBy[0]);
      if (groupBy) {
        /* stmt = stmt.groupBy(groupBy); */
      }

      // allow limit and offset by default
      if (!(options.allowLimit === false) && limit) stmt = stmt.limit(limit);
      if (!(options.allowOffset === false) && offset)
        stmt = stmt.offset(offset);

      return stmt.execute();
    };
  };
}
