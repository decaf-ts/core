import {
  ContextualArgs,
  ContextualLoggedClass,
} from "../utils/ContextualLoggedClass";
import { InternalError } from "@decaf-ts/db-decorators";
import { AuthorizationError } from "../utils/errors";
import { UnsupportedError } from "../persistence/errors";
import { PersistenceKeys } from "../persistence/constants";

export type AuthHandler = (
  ...args: ContextualArgs<any>
) => void | AuthorizationError;

function ensureLogCtx(
  thisArg: ContextualLoggedClass<any> | undefined,
  decoratorName: string,
  methodName: string
) {
  if (typeof (thisArg as any)?.logCtx !== "function") {
    const className =
      (thisArg as any)?.constructor?.name ?? "UnknownClass";
    throw new UnsupportedError(
      `${decoratorName} on ${className}.${methodName} requires a logCtx() method`
    );
  }
}

function createAuthProxy(
  decoratorName: string,
  handler: AuthHandler,
  argz: any[],
  propertyKey: any,
  descriptor: PropertyDescriptor
) {
  descriptor.value = new Proxy(descriptor.value, {
    async apply(targetFn, thisArg: ContextualLoggedClass<any>, args) {
      ensureLogCtx(thisArg, decoratorName, String(propertyKey));
      const { ctx, ctxArgs } = await (thisArg as any).logCtx(
        args,
        targetFn.name,
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
      if (error) {
        ctx.logger.action(PersistenceKeys.FORBIDDEN, error.code, {
          decorator: decoratorName,
          method: String(propertyKey),
          operation: ctx.get("operation"),
          error: error.message,
        });
        throw error;
      }
      return targetFn.call(thisArg, ...ctxArgs);
    },
  });
}

export function allowIf(handler: AuthHandler, ...argz: any[]) {
  return function allowIf(target: object, propertyKey?: any, descriptor?: any) {
    createAuthProxy("allowIf", handler, argz, propertyKey, descriptor);
  };
}

export function blockIf(handler: AuthHandler, ...argz: any[]) {
  return function blockIf(target: object, propertyKey?: any, descriptor?: any) {
    createAuthProxy("blockIf", handler, argz, propertyKey, descriptor);
  };
}
