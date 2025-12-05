import { apply, metadata, Metadata } from "@decaf-ts/decoration";
import { inject, injectable } from "@decaf-ts/injectable-decorators";
import { PersistenceKeys } from "../persistence/index";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import type { CrudOperations } from "@decaf-ts/db-decorators";
import { isOperationBlocked } from "./utils";
import { OperationKeys } from "@decaf-ts/db-decorators";

function OperationGuard(op: CrudOperations) {
  return function (
    target: any,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const ModelConstr = (this as any).ModelConstr;
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

export function service(key: string | ModelConstructor<any>) {
  key =
    typeof key === "string"
      ? key
      : Metadata.Symbol(key as ModelConstructor<any>).toString();
  return function service(target: any, prop?: any, descriptor?: any) {
    Metadata.set(PersistenceKeys.SERVICE, key, target);
    const decs = [];
    if (descriptor && typeof descriptor.value === "number") {
      decs.push(inject(key));
    } else if (!descriptor && !prop) {
      decs.push(
        injectable(key, {
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

    decs.push(metadata(PersistenceKeys.SERVICE, key));
    return apply(...decs)(target, prop, descriptor);
  };
}
