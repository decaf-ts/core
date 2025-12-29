import type { CrudOperations } from "@decaf-ts/db-decorators";
import { OperationKeys } from "@decaf-ts/db-decorators";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Metadata } from "@decaf-ts/decoration";

export function promiseSequence<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  return tasks.reduce(
    (chain, task) => chain.then(async (results) => [...results, await task()]),
    Promise.resolve([] as T[])
  );
}

export function isOperationBlocked(
  ModelConstructor: ModelConstructor<any>,
  op: CrudOperations
): boolean {
  const { handler, args }: { handler: any; args: CrudOperations[] } =
    (Metadata.get(
      ModelConstructor as any,
      OperationKeys.REFLECT + OperationKeys.BLOCK
    ) || {}) as {
      handler: (
        operations: CrudOperations[],
        operation: CrudOperations
      ) => boolean;
      args: any[];
    };

  return !handler ? false : (handler(...args, op) ?? false);
}
