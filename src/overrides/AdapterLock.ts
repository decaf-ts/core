import { isBrowser, LoggedClass } from "@decaf-ts/logging";
import {
  Lock,
  Transaction,
  TransactionLock,
} from "@decaf-ts/transactional-decorators";

type ResourceKey = string;

type ResourceState = {
  lock: Lock;
  owner?: Transaction<any>;
  count: number;
};

export class AdapterLock extends LoggedClass implements TransactionLock {
  private pendingTransactions: Transaction<any>[] = [];
  currentTransaction?: Transaction<any> = undefined;
  private readonly loggerCache = new Map<
    string,
    ReturnType<typeof this.log.for>
  >();

  override get log() {
    if (!this["_log"]) {
      this["_log"] = Transaction["log"].for(this);
    }
    return this["_log"];
  }

  private logger(method: "submit" | "fireTransaction" | "release") {
    if (!this.loggerCache.has(method)) {
      this.loggerCache.set(
        method,
        this.log.for((this as unknown as Record<string, any>)[method])
      );
    }
    return this.loggerCache.get(method) as ReturnType<typeof this.log.for>;
  }

  private readonly lock = new Lock();
  private readonly tableLocks = new Map<ResourceKey, ResourceState>();
  private readonly recordLocks = new Map<ResourceKey, ResourceState>();
  private readonly transactionTableRefs = new WeakMap<
    Transaction<any>,
    Map<ResourceKey, number>
  >();
  private readonly transactionRecordRefs = new WeakMap<
    Transaction<any>,
    Map<ResourceKey, number>
  >();

  constructor(
    private counter: number = 1,
    private readonly onBegin?: () => Promise<void>,
    private readonly onEnd?: (err?: Error) => Promise<void>
  ) {
    super();
  }

  /**
   * @description Ensures the provided transaction holds table-level locks
   */
  async lockTables(
    transaction: Transaction<any> | undefined,
    tables: string | string[]
  ): Promise<void> {
    if (!transaction) return;
    const normalized = Array.from(
      new Set(
        (Array.isArray(tables) ? tables : [tables])
          .filter((table) => typeof table !== "undefined" && table !== null)
          .map((table) => table.toString())
      )
    ).sort();
    if (!normalized.length) return;
    for (const table of normalized) {
      await this.acquireResource(
        this.tableLocks,
        this.transactionTableRefs,
        transaction,
        table
      );
    }
  }

  /**
   * @description Ensures the provided transaction holds record-level locks
   */
  async lockRecords(
    transaction: Transaction<any> | undefined,
    table: string,
    records: Array<string | number | bigint>
  ): Promise<void> {
    if (!transaction || !records.length) return;
    const tableKey = table.toString();
    const normalized = Array.from(
      new Set(
        records
          .filter((record) => typeof record !== "undefined" && record !== null)
          .map((record) => record.toString())
      )
    ).sort();
    if (!normalized.length) return;
    for (const record of normalized) {
      await this.acquireResource(
        this.recordLocks,
        this.transactionRecordRefs,
        transaction,
        this.recordKey(tableKey, record)
      );
    }
  }

  /**
   * @summary Submits a transaction to be processed
   * @param {Transaction} transaction
   */
  async submit<R>(transaction: Transaction<R>): Promise<R> {
    const log = this.logger("submit");
    await this.lock.acquire();
    log.silly(`Lock acquired to submit transaction ${transaction.id}`);
    if (
      this.currentTransaction &&
      this.currentTransaction.id === transaction.id
    ) {
      this.lock.release();
      log.silly(`Released lock for re-entrant transaction ${transaction.id}`);
      return transaction.fire();
    }
    let resultPromise: Promise<R>;
    if (this.counter > 0) {
      this.counter--;
      this.lock.release();
      log.silly(`Released lock for transaction ${transaction.id}`);
      resultPromise = this.fireTransaction(transaction);
    } else {
      log.debug(`Pushing transaction ${transaction.id} to the queue`);
      this.pendingTransactions.push(transaction);
      resultPromise = transaction.wait();
      this.lock.release();
      log.silly(`Released lock after queuing transaction ${transaction.id}`);
    }
    return resultPromise;
  }

  /**
   * @summary Executes a transaction
   *
   * @param {Transaction} transaction
   * @private
   */
  private async fireTransaction<R>(transaction: Transaction<R>): Promise<R> {
    const log = this.logger("fireTransaction");
    await this.lock.acquire();
    log.silly(`Lock acquired obtain transaction ${transaction.id}`);
    this.currentTransaction = transaction;
    this.lock.release();
    log.silly(`Released lock after obtaining ${transaction.id}`);
    if (this.onBegin) {
      log.verbose(`Calling onBegin for transaction ${transaction.id}`);
      await this.onBegin();
    }
    log.info(
      `Starting transaction ${transaction.id}. ${this.pendingTransactions.length} remaining...`
    );
    return transaction.fire();
  }
  /**
   * @summary Releases The lock after the conclusion of a transaction
   */
  async release(err?: Error): Promise<void> {
    const log = this.logger("release");

    await this.lock.acquire();
    if (!this.currentTransaction)
      log.warn(
        "Trying to release an unexisting transaction. should never happen..."
      );
    log.verbose(
      `Releasing transaction ${this.currentTransaction?.toString(true, true)}`
    );
    const finishingTransaction = this.currentTransaction;
    const id = finishingTransaction?.id;
    this.releaseTransactionResources(finishingTransaction);
    this.currentTransaction = undefined;
    this.lock.release();
    log.silly(`Released lock after clearing transaction ${id}`);
    if (this.onEnd) {
      log.verbose(`Calling onEnd for transaction ${id}`);
      await this.onEnd(err);
    }

    await this.lock.acquire();
    log.silly(
      `Acquired lock after completing transaction ${id} for pending transaction verification`
    );
    if (this.pendingTransactions.length > 0) {
      const transaction = this.pendingTransactions.shift() as Transaction<any>;

      const cb = () => {
        return this.fireTransaction.call(this, transaction).catch((err) => {
          this.log.for(this.fireTransaction).error(err);
        });
      };
      log.silly(`Marking ${transaction.id} for execution`);
      if (!isBrowser()) {
        globalThis.process.nextTick(cb); // if you are on node
      } else {
        setTimeout(cb, 0);
      } // if you are in the browser
    } else {
      log.debug(`No pending transactions. Incrementing counter.`);
      this.counter++;
    }
    this.lock.release();
    log.silly(`Released lock after completing transaction ${id}`);
  }

  private recordKey(table: string, record: string): ResourceKey {
    return `${table}::${record}`;
  }

  private async acquireResource(
    resources: Map<ResourceKey, ResourceState>,
    tracker: WeakMap<Transaction<any>, Map<ResourceKey, number>>,
    transaction: Transaction<any>,
    key: ResourceKey
  ): Promise<void> {
    let state = resources.get(key);
    if (!state) {
      state = { lock: new Lock(), count: 0 };
      resources.set(key, state);
    }
    if (state.owner && state.owner.id === transaction.id) {
      state.count++;
      this.trackHeldResource(tracker, transaction, key);
      return;
    }
    await state.lock.acquire();
    state.owner = transaction;
    state.count = 1;
    this.trackHeldResource(tracker, transaction, key);
  }

  private trackHeldResource(
    tracker: WeakMap<Transaction<any>, Map<ResourceKey, number>>,
    transaction: Transaction<any>,
    key: ResourceKey
  ) {
    let held = tracker.get(transaction);
    if (!held) {
      held = new Map();
      tracker.set(transaction, held);
    }
    held.set(key, (held.get(key) ?? 0) + 1);
  }

  private releaseTransactionResources(transaction?: Transaction<any>) {
    if (!transaction) return;
    const tableRefs = this.transactionTableRefs.get(transaction);
    if (tableRefs) {
      for (const [key, count] of tableRefs.entries()) {
        this.releaseResource(this.tableLocks, transaction, key, count);
      }
      this.transactionTableRefs.delete(transaction);
    }
    const recordRefs = this.transactionRecordRefs.get(transaction);
    if (recordRefs) {
      for (const [key, count] of recordRefs.entries()) {
        this.releaseResource(this.recordLocks, transaction, key, count);
      }
      this.transactionRecordRefs.delete(transaction);
    }
  }

  private releaseResource(
    resources: Map<ResourceKey, ResourceState>,
    transaction: Transaction<any>,
    key: ResourceKey,
    releaseCount: number
  ) {
    const state = resources.get(key);
    if (!state || !state.owner || state.owner.id !== transaction.id) return;
    state.count -= releaseCount;
    if (state.count <= 0) {
      state.owner = undefined;
      state.count = 0;
      state.lock.release();
    }
  }
}

export const adapterLock = new AdapterLock();
