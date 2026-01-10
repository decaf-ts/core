import { apply, Metadata, prop as property } from "@decaf-ts/decoration";
import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { PersistenceKeys } from "../persistence//constants";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import type { CrudOperations } from "@decaf-ts/db-decorators";
import { injectableServiceKey, isOperationBlocked } from "./utils";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { ModelService } from "../services/ModelService";

function OperationGuard(op: CrudOperations) {
  return function (
    target: any,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
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
