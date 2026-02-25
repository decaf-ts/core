import { InternalError } from "@decaf-ts/db-decorators";
import { Decoration, Metadata, method } from "@decaf-ts/decoration";
import { TransactionalKeys } from "@decaf-ts/transactional-decorators";
import { ModelService } from "../services/ModelService";
import { Repository } from "../repository/Repository";
import { Adapter } from "../persistence/Adapter";
import { ContextLock } from "../persistence/ContextLock";

export function getAdapterTransaction(obj: any, ...args: any[]) {
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

export function getContextLock(obj: any, ...args: any[]) {
  return new ContextLock(getAdapterTransaction(obj, ...args));
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
        const lock =
          ctx.getOrUndefined("transactionLock") || getContextLock(thisArg);
        ctx.put("transactionLock", lock);
        await lock.acquire();
        let results: any;
        try {
          results = await obj.call(thisArg, ...argArray, ctx);
        } catch (e: unknown) {
          try {
            await lock.rollback(e);
          } catch (e: unknown) {
            log.error(`Failed to rollback transaction`, e);
          }
          throw e;
        }

        try {
          await lock.release();
        } catch (e: unknown) {
          throw new InternalError(`Failed to release transaction: ${e}`);
        }

        return results;
      },
    });

    return descriptor;
  };
}

Decoration.for(TransactionalKeys.TRANSACTIONAL)
  .define({
    decorator: innerTransactional,
  } as any)
  .apply();
