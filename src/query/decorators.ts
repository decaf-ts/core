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
import type { DirectionLimitOffset } from "./types";

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
                const {
                  action,
                  select,
                  selector,
                  where,
                  groupBy,
                  orderBy,
                  limit,
                  offset,
                } = MethodQueryBuilder.build(target.name, ...args);

                const repo = thisArg as Repo<any>;

                // Build statement based on action type
                let stmt: any;
                switch (action) {
                  case "find":
                  case "page":
                    stmt = repo.select(select as any);
                    break;
                  case "count":
                    stmt = repo.count(selector as any);
                    break;
                  case "sum":
                    stmt = repo.sum(selector as any);
                    break;
                  case "avg":
                    stmt = repo.avg(selector as any);
                    break;
                  case "min":
                    stmt = repo.min(selector as any);
                    break;
                  case "max":
                    stmt = repo.max(selector as any);
                    break;
                  case "distinct":
                    stmt = repo.distinct(selector as any);
                    break;
                  case "group":
                    stmt = repo.select();
                    if (selector) {
                      stmt = stmt.groupBy(selector as any);
                    }
                    break;
                  default:
                    throw new QueryError(`Unsupported action: ${action}`);
                }

                if (where) stmt = stmt.where(where) as any;

                // Apply groupBy for non-group actions (groupBy from method name pattern)
                if (groupBy && groupBy.length > 0 && action !== "group") {
                  stmt = stmt.groupBy(groupBy[0] as any);
                  for (let i = 1; i < groupBy.length; i++) {
                    stmt = stmt.thenBy(groupBy[i] as any);
                  }
                } else if (
                  groupBy &&
                  groupBy.length > 0 &&
                  action === "group"
                ) {
                  // For group action, apply additional groupBy fields after the selector
                  for (const field of groupBy) {
                    stmt = stmt.thenBy(field as any);
                  }
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

                // For page action, call paginate instead of execute
                if (action === "page") {
                  // Extract pagination parameters from args
                  // The last argument should be DirectionLimitOffset or page size
                  const lastArg = args[args.length - 1];
                  const pageSize =
                    typeof lastArg === "number"
                      ? lastArg
                      : ((lastArg as DirectionLimitOffset)?.limit ?? 10);
                  return stmt.paginate(pageSize);
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
