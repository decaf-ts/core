import { QueryOptions } from "./types";
import { MethodQueryBuilder } from "./MethodQueryBuilder";

export function query(options: QueryOptions = {}) {
  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>
  ): TypedPropertyDescriptor<any> | void => {
    // const originalMethod = descriptor.value;
    const methodName = propertyKey.toString();
    descriptor.value = function (...args: any[]) {
      const { select, where, groupBy, orderBy, limit, offset } =
        MethodQueryBuilder.build(methodName, ...args);

      let stmt = (this as any).select(select) as any;
      if (where) stmt = stmt.where(where);
      // if (orderBy) stmt = stmt.orderBy(orderBy[0]);
      if (groupBy) {
        // group by not implemented yet
        /* stmt = stmt.groupBy(groupBy); */
      }

      // allow limit and offset by default
      const { allowLimit, allowOffset, allowOrderBy, throws } = {
        allowLimit: true,
        allowOrderBy: true,
        allowOffset: true,
        throws: true,
        ...options,
      };

      const params = [
        // keep the order to ensure the expected behavior
        { key: "orderBy", value: (orderBy || [])[0], allowed: allowOrderBy }, // orderBy only supports one sentence
        { key: "limit", value: limit, allowed: allowLimit },
        { key: "offset", value: offset, allowed: allowOffset },
      ];

      for (const param of params) {
        if (param.value !== undefined) {
          if (!param.allowed && throws) {
            throw new Error(
              `${param.key[0].toUpperCase() + param.key.slice(1)} is not allowed for this query`
            );
          } else if (param.allowed) {
            stmt = stmt[param.key](param.value);
          }
        }
      }

      return stmt.execute();
    };
  };
}
