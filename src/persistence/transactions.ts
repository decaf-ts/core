import { InternalError } from "@decaf-ts/db-decorators";
import { Decoration, Metadata, method } from "@decaf-ts/decoration";
import { TransactionalKeys } from "@decaf-ts/transactional-decorators";
import { ModelService } from "../services/ModelService";
import { Repository } from "../repository/Repository";
import { Adapter } from "../persistence/Adapter";
import { ContextLock } from "../persistence/ContextLock";

/**
 * @description Resolves the transaction lock for a `@transactional`-decorated call
 * @summary Finds the underlying adapter for the decorated object (Adapter, Repository, or
 * ModelService) and asks it for a fresh `ContextLock` via `Adapter.transactionLock()`
 */
export function resolveTransactionLock(obj: any, ...args: any[]): ContextLock {
  let adapter: Adapter<any, any, any, any> | undefined;
  if (obj instanceof ModelService)
    adapter = obj.repo.adapter as Adapter<any, any, any, any>;
  if (obj instanceof Repository)
    adapter = obj["adapter"] as Adapter<any, any, any, any>;
  if (obj instanceof Adapter) adapter = obj;
  if (!adapter)
    throw new InternalError(`Could not find adapter to extract transaction`);
  return adapter.transactionLock(...args);
}

function innerTransactional(...data: any[]) {
  return function (target: any, propertyKey?: any, descriptor?: any) {
    if (!descriptor)
      throw new InternalError("This decorator only applies to methods");
    method()(target, propertyKey, descriptor);
    Metadata.set(
      target.constructor,
      Metadata.key(TransactionalKeys.TRANSACTIONAL, propertyKey),
      {
        data: data,
      }
    );
    descriptor.value = new Proxy(descriptor.value, {
      async apply<R>(obj: any, thisArg: any, argArray: any[]): Promise<R> {
        const { log, ctx } = (
          await thisArg["logCtx"](argArray, obj.name, true)
        ).for(obj);

        // Reuse an in-flight transaction (nested @transactional call) instead of starting a new one
        const existing: ContextLock | undefined =
          ctx.getOrUndefined("transactionLock");
        const lock = existing || resolveTransactionLock(thisArg);

        lock.depth++;
        if (!existing) {
          // only cache the lock once begin() succeeds, so a rejected begin() (e.g.
          // maxConcurrentTransactions=0) leaves no stale lock/depth on the context
          await lock.begin(ctx);
          ctx.cache.put("transactionLock", lock);
        }

        let results: any;
        try {
          results = await obj.call(thisArg, ...argArray, ctx);
        } catch (e: unknown) {
          // An inner @transactional frame may have already rolled back and ended
          // the transaction (depth forced to 0); enclosing frames must not roll back again
          const alreadyEnded = lock.depth === 0;
          lock.depth = 0;
          if (!alreadyEnded) {
            try {
              await lock.rollback(e as Error, ctx);
            } catch (rollbackError: unknown) {
              log.error(
                `Failed to rollback transaction`,
                rollbackError as Error
              );
            }
          }
          throw e;
        }

        lock.depth--;
        if (lock.depth === 0) {
          try {
            await lock.commit(ctx);
          } catch (e: unknown) {
            throw new InternalError(`Failed to commit transaction: ${e}`);
          }
        }

        return results;
      },
    });

    return descriptor;
  };
}

/**
 * @description Method decorator that wraps a method in core's transaction-lock mechanism
 * @summary `@decaf-ts/transactional-decorators` exports its own `transactional()` factory, and that
 * factory re-registers its own (base) decorator under the same Decoration key every time it is called
 * — so importing core does not make core's implementation "stick" if anything also calls the base
 * package's factory. Consumers that want core's `ContextLock`/per-adapter transaction-lock behavior
 * MUST import `transactional` from `@decaf-ts/core` (this function), not from
 * `@decaf-ts/transactional-decorators`. Whichever factory is called last determines the active
 * implementation for the shared key/flavour going forward.
 * @param {...any[]} data - Optional metadata available to the transaction-lock implementation
 * @function transactional
 * @category Decorators
 */
export function transactional(...data: any[]) {
  return Decoration.for(TransactionalKeys.TRANSACTIONAL)
    .define({
      decorator: innerTransactional,
      args: data,
    } as any)
    .apply();
}
