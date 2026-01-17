import {
  Context as Ctx,
  ContextFlags,
  InternalError,
} from "@decaf-ts/db-decorators";
import { AdapterFlags } from "./types";
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
}
