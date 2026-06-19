import { type Adapter } from "./Adapter";
import { type Context } from "./Context";
import { DefaultAdapterFlags } from "./constants";
import { UnsupportedError } from "./errors";
import { Lock } from "@decaf-ts/transactional-decorators";

/**
 * @description Counting semaphore used by the default `ContextLock` to gate concurrent transactions
 * @summary Simple FIFO semaphore: `acquire()` resolves immediately while permits remain, otherwise the
 * caller is queued and resolved (without touching the permit count) the moment `release()` hands the
 * permit directly to the next waiter. `SimpleConcurrencyLock.for(adapter, limit)` is the single,
 * self-contained way to get the one gate shared by every transaction on that adapter - no extra state
 * or methods live on `Adapter` itself for this.
 * @class SimpleConcurrencyLock
 */
export class SimpleConcurrencyLock extends Lock {
  private static readonly registry = new WeakMap<
    Adapter<any, any, any, any>,
    SimpleConcurrencyLock
  >();

  /**
   * @description Returns the one `SimpleConcurrencyLock` for this adapter, creating it on first use
   * @summary `limit` only matters the first time it's called for a given adapter - the gate's capacity
   * is fixed for the adapter's lifetime, the same way the adapter's own client/connection is.
   */
  static for(
    adapter: Adapter<any, any, any, any>,
    limit: number
  ): SimpleConcurrencyLock {
    let lock = SimpleConcurrencyLock.registry.get(adapter);
    if (!lock) {
      lock = new SimpleConcurrencyLock(limit);
      SimpleConcurrencyLock.registry.set(adapter, lock);
    }
    return lock;
  }

  private permits: number;
  private readonly waiters: (() => void)[] = [];

  private constructor(permits: number) {
    super();
    this.permits = permits;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async acquire(ctx?: Context<any>): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override release(ctx?: Context<any>): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.permits++;
  }
}

/**
 * @description Per-adapter transaction lock
 * @summary Default transaction boundary implementation stored on the Context by `@transactional`.
 * Gated by the `maxConcurrentTransactions` flag (see `AdapterFlags`): `-1` (default) means no limit and
 * `begin`/`commit`/`rollback` behave as a no-op; `0` disables transactions outright (every call throws);
 * any positive number gates concurrent transactions through `SimpleConcurrencyLock.for(adapter, limit)`,
 * the one counting semaphore shared by every transaction on that adapter, queuing callers until a slot
 * frees up.
 * Adapters with native transaction support (e.g. a SQL adapter wrapping BEGIN/COMMIT/ROLLBACK) override
 * `Adapter.transactionLock()` to return a subclass with real `begin`/`commit`/`rollback` behavior - if that
 * subclass does not call `super.begin()`/`super.commit()`/`super.rollback()`, `maxConcurrentTransactions`
 * has no effect for it, since concurrency is then governed by the underlying database instead.
 * `transactionLock()` always returns a *fresh* `ContextLock` per top-level transaction - it's the
 * per-transaction handle (nesting `depth`, and for native adapters the actual exclusive connection/cursor),
 * so it cannot be a singleton itself; only the concurrency gate it delegates to is shared.
 * Nesting (reusing the same instance across nested `@transactional` calls, and deciding when to actually
 * call `begin`/`commit`/`rollback`) is owned by the `@transactional` proxy via `depth`, not by this class.
 * @class ContextLock
 */
export class ContextLock<
  A extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
> {
  /**
   * @description Nesting depth, owned and mutated by the `@transactional` proxy
   */
  depth = 0;

  private semaphore?: SimpleConcurrencyLock;

  constructor(
    protected adapter: A,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {}

  /**
   * @description Called once, by the outermost `@transactional` call
   * @summary `context` already exists by the time this is called (the `@transactional` proxy always
   * builds it before calling `begin`), so this routes it through `Adapter.logCtx()` with `allowCreate`
   * left at its default `false` - there is nothing to create here, only the existing context (and its
   * logger) to reuse. Passing `allowCreate: true` would be wrong: it skips the "reuse the context I was
   * given" branch entirely and tries to build a new one through `Adapter.context()`, whose third
   * positional parameter is reserved for a model constructor - the context would be misread as "model".
   * @param {Context<any>} context - The context the transaction is starting under
   */
  async begin(context: Context<any>): Promise<void> {
    const { log, ctx } = this.adapter["logCtx"]([context], this.begin);
    const value = ctx.getOrUndefined("maxConcurrentTransactions" as any);
    const limit =
      typeof value === "number"
        ? value
        : DefaultAdapterFlags.maxConcurrentTransactions;

    if (limit === 0) {
      log.debug(
        `Rejecting transaction on adapter "${this.adapter.alias}": transactions are disabled (maxConcurrentTransactions=0)`
      );
      throw new UnsupportedError(
        `Transactions are disabled for adapter "${this.adapter.alias}" (maxConcurrentTransactions=0)`
      );
    }
    if (limit > 0) {
      log.silly(
        `Gating transaction on adapter "${this.adapter.alias}" (maxConcurrentTransactions=${limit})`
      );
      this.semaphore = SimpleConcurrencyLock.for(this.adapter, limit);
      await this.semaphore.acquire(ctx);
    }
  }

  /**
   * @description Called once, when the outermost `@transactional` call exits successfully
   * @param {Context<any>} context - The context the transaction ran under
   */
  async commit(context: Context<any>): Promise<void> {
    const { ctx } = this.adapter["logCtx"]([context], this.commit);
    this.semaphore?.release(ctx);
  }

  /**
   * @description Called once, by whichever call hits the error first. Ends the transaction outright
   * @param {Error} err - The error that triggered the rollback
   * @param {Context<any>} context - The context the transaction ran under
   */
  async rollback(err: Error, context: Context<any>): Promise<void> {
    const { ctx } = this.adapter["logCtx"]([context], this.rollback);
    this.semaphore?.release(ctx);
  }
}
