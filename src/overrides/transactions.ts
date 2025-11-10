import { Decoration, method, Metadata } from "@decaf-ts/decoration";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  Transaction,
  TransactionalKeys,
} from "@decaf-ts/transactional-decorators";
import { adapterLock } from "./AdapterLock";

/**
 * Refactor this to:
 * Use AdapterLock to manage transactions;
 *
 */
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
        return new Promise<R>((resolve, reject) => {
          async function exitFunction(
            transaction: Transaction<R>,
            err?: Error | R,
            result?: R
          ): Promise<R> {
            if (err && !(err instanceof Error) && !result) {
              result = err;
              err = undefined;
            }
            await transaction.release(err as Error | undefined);
            return err
              ? (reject(err) as unknown as R)
              : (resolve(result as R) as unknown as R);
          }

          const candidate = argArray[0];
          const transactionPrefixLength = (() => {
            let count = 0;
            while (
              count < argArray.length &&
              argArray[count] instanceof Transaction
            ) {
              count++;
            }
            return count;
          })();
          const invocationArgs =
            transactionPrefixLength > 0
              ? argArray.slice(transactionPrefixLength)
              : argArray;

          const activeTransaction =
            candidate instanceof Transaction
              ? candidate
              : Transaction.contextTransaction(thisArg);

          if (activeTransaction) {
            const updatedTransaction: Transaction<any> = new Transaction(
              target.name,
              propertyKey,
              async () => {
                try {
                  return resolve(
                    await Reflect.apply(
                      obj,
                      updatedTransaction.bindToTransaction(thisArg),
                      invocationArgs
                    )
                  );
                } catch (e: unknown) {
                  return reject(e);
                }
              },
              data.length ? data : undefined
            );
            activeTransaction.bindTransaction(updatedTransaction);
            activeTransaction.fire();
          } else {
            const newTransaction: Transaction<R> = new Transaction(
              target.name,
              propertyKey,
              async () => {
                try {
                  return exitFunction(
                    newTransaction,
                    undefined,
                    await Reflect.apply(
                      obj,
                      newTransaction.bindToTransaction(thisArg),
                      invocationArgs
                    )
                  );
                } catch (e: unknown) {
                  return exitFunction(newTransaction, e as Error);
                }
              },
              data.length ? data : undefined
            );
            Transaction.submit(newTransaction);
          }
        });
      },
    });

    return descriptor;
  };
}

Decoration.for(TransactionalKeys.TRANSACTION)
  .define({
    decorator: innerTransactional,
    args: [],
  })
  .apply();

Transaction.setLock(adapterLock);
