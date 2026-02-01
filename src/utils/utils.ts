import { CrudOperations, InternalError } from "@decaf-ts/db-decorators";
import { OperationKeys } from "@decaf-ts/db-decorators";
import type { ModelConstructor } from "@decaf-ts/decorator-validation";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { MigrationRuleError } from "../persistence/errors";

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

export function promiseSequence<T>(
  tasks: (() => Promise<T>)[],
  continueOnError?: false
): Promise<T[]>;
export function promiseSequence<T>(
  tasks: (() => Promise<T>)[],
  continueOnError: true
): Promise<PromiseSettledResult<T>[]>;
export async function promiseSequence<T>(
  tasks: (() => Promise<T>)[],
  continueOnError = false
): Promise<T[] | PromiseSettledResult<T>[]> {
  if (!continueOnError) {
    const results: T[] = [];
    for (const task of tasks) {
      results.push(await task());
    }
    return results;
  }

  const settled: PromiseSettledResult<T>[] = [];
  for (const task of tasks) {
    try {
      settled.push({ status: "fulfilled", value: await task() });
    } catch (reason) {
      settled.push({ status: "rejected", reason });
    }
  }
  return settled;
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

export function prefixMethod(
  obj: any,
  after: (...args: any[]) => any,
  prefix: (...args: any[]) => any,
  afterName?: string
) {
  async function wrapper(this: any, ...args: any[]) {
    let results: any[];
    try {
      results = await Promise.resolve(prefix.call(this, ...args));
    } catch (e: unknown) {
      if (e instanceof MigrationRuleError) return;
      throw e;
    }
    return Promise.resolve(after.apply(this, results));
  }

  const wrapped = wrapper.bind(obj);
  const name = afterName ? afterName : after.name;
  Object.defineProperty(wrapped, "name", {
    enumerable: true,
    configurable: true,
    writable: false,
    value: name,
  });
  obj[name] = wrapped;
}
