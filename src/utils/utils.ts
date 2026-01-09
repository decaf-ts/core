import { CrudOperations, InternalError } from "@decaf-ts/db-decorators";
import { OperationKeys } from "@decaf-ts/db-decorators";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";

export function injectableServiceKey(
  name: string | symbol | Constructor
): string {
  if (!name) throw new InternalError(`No name provided`);
  return typeof name === "string"
    ? name.replaceAll(".", "-")
    : Metadata.Symbol(Metadata.constr(name as ModelConstructor<any>))
        .toString()
        .replaceAll(".", "-");
}

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

/**
 * @description Normalizes imports to handle both CommonJS and ESModule formats.
 * @summary Utility function to handle module import differences between formats.
 *
 * @template T - Type of the imported module.
 * @param {Promise<T>} importPromise - Promise returned by dynamic import.
 * @return {Promise<T>} Normalized module.
 *
 * @function normalizeImport
 *
 * @memberOf module:core
 */
export async function normalizeImport<T>(
  importPromise: Promise<T>
): Promise<T> {
  // CommonJS's `module.exports` is wrapped as `default` in ESModule.
  return importPromise.then((m: any) => (m.default || m) as T);
}
