import { Metadata } from "@decaf-ts/decoration";
import { CrudOperations, OperationKeys } from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import type { ModelService } from "./ModelService";

export function isOperationBlocked(
  ModelConstructor: ModelConstructor<any>,
  op: CrudOperations
): boolean {
  const { handler, args } = (Metadata.get(
    ModelConstructor as any,
    OperationKeys.REFLECT + OperationKeys.BLOCK
  ) || {}) as {
    handler: (
      operations: CrudOperations[],
      operation: CrudOperations
    ) => boolean;
    args: any[];
  };

  // @ts-ignore
  return !handler ? false : (handler(...args, op) ?? false);
}

function OperationGuard(op: CrudOperations) {
  return function (
    target: any,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const ModelConstr = (this as ModelService<any>).ModelConstr;
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
