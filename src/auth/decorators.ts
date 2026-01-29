import {
  ContextualArgs,
  ContextualLoggedClass,
} from "../utils/ContextualLoggedClass";
import { InternalError } from "@decaf-ts/db-decorators";
import { AuthorizationError } from "../utils/errors";

export type AuthHandler = (
  ...args: ContextualArgs<any>
) => void | AuthorizationError;

export function allowIf(handler: AuthHandler, ...argz: any[]) {
  return function allowIf(target: object, propertyKey?: any, descriptor?: any) {
    descriptor.value = new Proxy(descriptor.value, {
      async apply(target, thisArg: ContextualLoggedClass<any>, args) {
        const { ctx, ctxArgs } = await thisArg["logCtx"](
          args,
          target.name,
          true
        );
        let error: void | AuthorizationError;
        try {
          error = handler(...args, ...argz, ctx);
        } catch (e: unknown) {
          throw new InternalError(
            `Failed to execute auth validation handler: ${e}`
          );
        }
        if (error) throw error;
        return target.call(thisArg, ...ctxArgs);
      },
    });
  };
}

export function blockIf(handler: AuthHandler, ...argz: any[]) {
  return function blockIf(target: object, propertyKey?: any, descriptor?: any) {
    descriptor.value = new Proxy(descriptor.value, {
      async apply(target, thisArg: ContextualLoggedClass<any>, args) {
        const { ctx, ctxArgs } = await thisArg["logCtx"](
          args,
          target.name,
          true
        );
        let error: void | AuthorizationError;
        try {
          error = handler(...args, ...argz, ctx);
        } catch (e: unknown) {
          throw new InternalError(
            `Failed to execute auth validation handler: ${e}`
          );
        }
        if (error) throw error;
        return target.call(thisArg, ...ctxArgs);
      },
    });
  };
}
