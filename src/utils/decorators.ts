import { apply, Constructor, Decoration, metadata, Metadata, methodMetadata, prop as property } from "@decaf-ts/decoration";
import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { PersistenceKeys } from "../persistence//constants";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import type { CrudOperations } from "@decaf-ts/db-decorators";
import { injectableServiceKey, isOperationBlocked } from "./utils";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { ModelService } from "../services/ModelService";
import { DecafRouteDecOptions, HttpVerbs } from "./types";

function OperationGuard(op: CrudOperations) {
  return function (target: any, _propertyKey?: any, descriptor?: any) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const ModelConstr = (this as ModelService<any, any>).class;
      if (ModelConstr && isOperationBlocked(ModelConstr, op)) {
        const name = ModelConstr?.name ?? "Model";
        throw new Error(
          `Operation "${op}" is blocked by @BlockOperations for ${name}.`
        );
      }
      return original.apply(this, args);
    };
    return descriptor;
  };
}

export const create = () => OperationGuard(OperationKeys.CREATE);
export const read = () => OperationGuard(OperationKeys.READ);
export const update = () => OperationGuard(OperationKeys.UPDATE);
export const del = () => OperationGuard(OperationKeys.DELETE);

export function service(key?: string | ModelConstructor<any>) {
  return function service(target: any, prop?: any, descriptor?: any) {
    if (!descriptor && !prop) {
      // class
      key = key || target;
    } else {
      property()(target, prop);
      // property
      key = key || Metadata.type(target.constructor, prop);
    }

    key = injectableServiceKey(key as any);

    const decs = [];
    if (descriptor && typeof descriptor.value === "number") {
      decs.push(inject(key));
    } else if (!descriptor && !prop) {
      Metadata.set(PersistenceKeys.SERVICE, key, target);
      decs.push(
        injectable(key, {
          singleton: true,
          callback: (inst: any) =>
            Object.defineProperty(inst, "name", {
              enumerable: true,
              configurable: false,
              writable: false,
              value: key,
            }),
        })
      );
    } else if (!descriptor) {
      decs.push(inject(key));
    } else throw new Error("Invalid decorator usage. Should be impossible");

    // decs.push(metadata(PersistenceKeys.SERVICE, key));
    return apply(...decs)(target, prop, descriptor);
  };
}

export function auth(model: string | Constructor) {
  const decorationKey = PersistenceKeys.AUTH;

  function auth(model: string | Constructor) {
    return metadata(decorationKey,model)
  }

  return Decoration.for(decorationKey)
    .define({
      decorator: auth,
      args: [model],
    })
    .apply();
}

/**
 * A decorator function that sets the roles required for authentication and authorization to the model in NestJS.
 *
 * @param roles - An array of role names required for access.
 *
 * @returns - A function that applies the role decorators to the target.
 *
 * @example
 * ```typescript
 * @model('users')
 * @Roles(['admin'])
 * export class UserModel {
 *  //...
 * }
 *
 */
export const roles = (roles: string[]) => {
  return metadata(PersistenceKeys.AUTH_ROLE, roles);
};

export function route(httpMethod: HttpVerbs, path: string) {
  const key = PersistenceKeys.DECAF_ROUTE;
  function route() {
    return function route(obj: object, prop?: any, descriptor?: any) {
      const options: DecafRouteDecOptions = {
        path: path,
        httpMethod: httpMethod,
        handler: descriptor,
      };

      return apply(methodMetadata(Metadata.key(key, prop), options))(
        obj,
        prop,
        descriptor
      );
    };
  }

  return Decoration.for(key)
    .define({
      decorator: route,
      args: [],
    })
    .apply();
}

