import { Context as Ctx, InternalError } from "@decaf-ts/db-decorators";
import { AdapterFlags, ContextFlags } from "./types";

export class Context<
  F extends ContextFlags<any> = AdapterFlags<any>,
> extends Ctx<F> {
  constructor(ctx?: Context<any>) {
    super(ctx as Ctx<any>);
  }

  pushPending(key: string, id: string) {
    const pending = this.pending() || {};
    pending[key] = pending[key] || [];
    if (pending[key].includes(id)) {
      throw new InternalError(
        `Trying to push a repeated pending ${key} task: ${id}`
      );
    }
    pending[key].push(id);
    this.accumulate({ pending: pending });
  }

  getFromChildren<K extends keyof F>(
    key: K,
    visited: Set<Context<any>> = new Set()
  ): F[K] | undefined {
    if (visited.has(this)) return undefined;
    visited.add(this);
    const res = this.getOrUndefined(key);
    if (res !== undefined && res !== null) return res;
    let children = this.getOrUndefined("childContexts" as K);
    if (children && (children as any).length) {
      children = (children as any[]).filter(
        (child: any) => !visited.has(child)
      ) as any;
      if ((children as any[]).length) {
        const results = (children as any[])
          .map((child: any) => child.getFromChildren(key, visited))
          .flat()
          .filter((el: unknown) => el !== undefined && el !== null) as F[K][];
        if (!results.length) return undefined;
        if (results.some((el) => typeof el !== "object")) return results[0];
        return results.reduce(
          (acc, el) => Object.assign(acc, el),
          {} as Record<any, any>
        ) as F[K];
      }
    }
    return undefined;
  }

  pending(): Record<string, string[]> | undefined {
    return this.getFromChildren("pending");
  }

  getOrUndefined<K extends keyof F>(key: K): F[K] | undefined {
    try {
      return this.get(key);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      return undefined;
    }
  }

  override(conf: Partial<F>) {
    return new Proxy(this, {
      get: (target: this, p: string | symbol, receiver: any) => {
        if (p === "get") {
          return new Proxy(target.get, {
            apply: (
              method: typeof target.get,
              _thisArg: unknown,
              argArray: any[]
            ) => {
              const prop = argArray[0] as keyof F;
              if (!prop)
                throw new InternalError(
                  `Invalid property access to overridden context: ${prop as string}`
                );
              if (prop in conf) return conf[prop];
              return Reflect.apply(method, receiver, argArray);
            },
          });
        }
        return Reflect.get(target, p, receiver);
      },
    }) as this;
  }

  toOverrides() {
    return this.cache.keys().reduce((acc: Record<string, any>, key) => {
      acc[key] = this.get(key as any);
      return acc;
    }, {});
  }

  override accumulate<V extends object>(value: V): Context<F & V> {
    return super.accumulate(value) as Context<F & V>;
  }
}
