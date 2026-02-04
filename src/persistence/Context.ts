import { Context as Ctx, InternalError } from "@decaf-ts/db-decorators";
import { AdapterFlags, ContextFlags } from "./types";
import { Lock } from "@decaf-ts/transactional-decorators";

export class ContextLock extends Lock {
  constructor() {
    super();
  }
}

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

  getFromChildren<K extends keyof F>(key: K): F[K] | undefined {
    const res = this.getOrUndefined(key);
    if (res) return res;
    const children = this.getOrUndefined("childContexts");
    if (children && children.length) {
      return children
        .filter((child) => child !== this)
        .map((child) => (child as any).getFromChildren(key))
        .flat()
        .reduce(
          (acc, el) => {
            return Object.assign(acc, el);
          },
          {} as Record<any, any>
        );
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
