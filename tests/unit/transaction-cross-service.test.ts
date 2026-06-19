/**
 * @description Test for single transaction survival across nested @transactional calls
 * @summary Verifies that nested @transactional() calls (across Repository method boundaries) reuse
 * the same ContextLock instance, and that begin/commit are each called exactly once for the
 * outermost call, using @decaf-ts/core's own transactional decorator (not transactional-decorators'
 * base implementation, which re-registers itself under the same Decoration key whenever it's used).
 */
import "reflect-metadata";
import { Adapter, ContextLock, Repository, transactional } from "../../src/index";
import { RamAdapter } from "../../src/ram";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

class CountingLock extends ContextLock {
  begins = 0;
  commits = 0;
  rollbacks = 0;

  override async begin(): Promise<void> {
    this.begins++;
  }

  override async commit(): Promise<void> {
    this.commits++;
  }

  override async rollback(): Promise<void> {
    this.rollbacks++;
  }
}

class CountingAdapter extends RamAdapter {
  locksHanded: CountingLock[] = [];

  override transactionLock(...args: any[]): CountingLock {
    const lock = new CountingLock(this, ...args);
    this.locksHanded.push(lock);
    return lock;
  }
}

@model()
class TxModel extends Model {
  constructor(arg?: ModelArg<TxModel>) {
    super(arg);
  }
}

class TxRepository extends Repository<TxModel, CountingAdapter> {
  constructor(adapter: CountingAdapter) {
    super(adapter, TxModel);
  }

  @transactional()
  async outer(...args: any[]): Promise<string> {
    await this.inner(...args);
    await this.inner(...args);
    return "outer-done";
  }

  @transactional()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async inner(...args: any[]): Promise<string> {
    return "inner-done";
  }
}

describe("CrossServiceTransactionTest", function () {
  let adapter: CountingAdapter;

  afterEach(async () => {
    if (adapter) {
      Adapter.unregister(adapter.alias);
    }
  });

  it("reuses the same transaction lock across nested @transactional calls", async () => {
    adapter = new CountingAdapter(undefined, `counting-${Date.now()}`);
    const repo = new TxRepository(adapter);

    await repo.outer();

    expect(adapter.locksHanded.length).toBe(1);
    const lock = adapter.locksHanded[0];
    expect(lock.begins).toBe(1);
    expect(lock.commits).toBe(1);
    expect(lock.rollbacks).toBe(0);
    expect(lock.depth).toBe(0);
  });
});
