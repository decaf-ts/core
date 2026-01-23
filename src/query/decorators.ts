import { QueryOptions, ViewKind, ViewMetadata, ViewOptions } from "./types";
import { MethodQueryBuilder } from "./MethodQueryBuilder";
import { QueryError } from "./errors";
import {
  apply,
  Decoration,
  Metadata,
  methodMetadata,
  propMetadata,
} from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/constants";
import type { Repo } from "../repository";
import { Operator } from "./constants";

export function prepared() {
  function prepared() {
    return function prepared(obj: object, prop?: any, descriptor?: any) {
      return apply(
        methodMetadata(Metadata.key(PersistenceKeys.STATEMENT, prop), true)
      )(obj, prop, descriptor);
    };
  }
  return Decoration.for(PersistenceKeys.STATEMENT)
    .define({
      decorator: prepared,
      args: [],
    })
    .apply();
}

export function query(options: QueryOptions = {}) {
  function query(options: QueryOptions) {
    return function query(obj: object, prop?: any, descriptor?: any) {
      function innerQuery(options: QueryOptions) {
        return function innerQuery(
          obj: any,
          propertyKey?: any,
          descriptor?: any
        ) {
          (descriptor as TypedPropertyDescriptor<any>).value = new Proxy(
            (descriptor as TypedPropertyDescriptor<any>).value,
            {
              apply(target: any, thisArg: any, args: any[]): any {
                const { select, where, groupBy, orderBy, limit, offset } =
                  MethodQueryBuilder.build(target.name, ...args);

                let stmt = (thisArg as Repo<any>).select(select as any);
                if (where) stmt = stmt.where(where) as any;
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
                } as QueryOptions;

                const params = [
                  // keep the order to ensure the expected behavior
                  {
                    key: "orderBy",
                    value: (orderBy || [])[0], // orderBy only supports one sentence
                    allowed: allowOrderBy,
                  },
                  { key: "limit", value: limit, allowed: allowLimit },
                  { key: "offset", value: offset, allowed: allowOffset },
                ];

                for (const param of params) {
                  if (param.value !== undefined) {
                    if (!param.allowed && throws) {
                      throw new QueryError(
                        `${param.key[0].toUpperCase() + param.key.slice(1)} is not allowed for this query`
                      );
                    } else if (param.allowed) {
                      stmt = (stmt as any)[param.key](param.value);
                    }
                  }
                }

                return stmt.execute();
              },
            }
          );
        };
      }

      const fields = MethodQueryBuilder.getFieldsFromMethodName(prop);
      // const paramNames = descriptor.value
      //   .toString()
      //   .match(/\(([^)]*)\)/)?.[1]
      //   .split(",")
      //   .map((x) => x.trim())
      //   .filter(Boolean);
      return apply(
        methodMetadata(Metadata.key(PersistenceKeys.QUERY, prop), {
          ...options,
          fields,
        }),
        prepared(),
        innerQuery(options)
      )(obj, prop, descriptor);
    };
  }

  return Decoration.for(PersistenceKeys.QUERY)
    .define({
      decorator: query,
      args: [options],
    })
    .apply();
}

function nextViewSlot(
  target: any,
  key: PersistenceKeys | Operator,
  attr: string
): string {
  const existing = Metadata.get(target.constructor, key) || {};
  const attrBucket = existing[attr] || {};
  const next = Object.keys(attrBucket).length + 1;
  return String(next);
}

export function applyViewDecorator(
  metaKey: PersistenceKeys | Operator,
  kind: ViewKind,
  opts?: ViewOptions
) {
  return function decorator(target: any, attr: any) {
    const slot = opts?.name || nextViewSlot(target, metaKey, attr as string);
    const key = Metadata.key(metaKey, attr as string, slot);
    const value: ViewMetadata = {
      ...(opts || {}),
      kind,
      attribute: attr as string,
    };
    return propMetadata(key, value)(target, attr);
  };
}

export function view<OPTS extends ViewOptions>(opts?: OPTS) {
  return Decoration.for(Operator.VIEW)
    .define({
      decorator: function view(o?: ViewOptions) {
        return applyViewDecorator(Operator.VIEW, "view", o);
      },
      args: [opts],
    })
    .apply();
}
