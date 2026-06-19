/**
 * @description Test for rollback ending the whole transaction outright
 * @summary An error inside a nested @transactional call must roll back and end the transaction
 * immediately (depth forced to 0) rather than leaving it half-open for an outer frame to commit.
 */
import "reflect-metadata";
import { Adapter, ContextLock, Repository, transactional } from "../../src/index";
import { RamAdapter } from "../../src/ram";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

class CountingLock extends ContextLock {
  begins = 0;
  commits = 0;
  rollbacks = 0;
  lastError?: Error;

  override async begin(): Promise<void> {
    this.begins++;
  }

  override async commit(): Promise<void> {
    this.commits++;
  }

  override async rollback(err: Error): Promise<void> {
    this.rollbacks++;
    this.lastError = err;
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
class RollbackModel extends Model {
  constructor(arg?: ModelArg<RollbackModel>) {
    super(arg);
  }
}

class RollbackRepository extends Repository<RollbackModel, CountingAdapter> {
  constructor(adapter: CountingAdapter) {
    super(adapter, RollbackModel);
  }

  @transactional()
  async outer(...args: any[]): Promise<string> {
    await this.failingInner(...args);
    return "should-not-reach-here";
  }

  @transactional()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async failingInner(...args: any[]): Promise<string> {
    throw new Error("boom");
  }
}

describe("Transaction rollback", () => {
  let adapter: CountingAdapter;

  afterEach(() => {
    if (adapter) Adapter.unregister(adapter.alias);
  });

  it("ends the transaction outright on error, without committing", async () => {
    adapter = new CountingAdapter(undefined, `counting-rb-${Date.now()}`);
    const repo = new RollbackRepository(adapter);

    await expect(repo.outer()).rejects.toThrow("boom");

    expect(adapter.locksHanded.length).toBe(1);
    const lock = adapter.locksHanded[0];
    expect(lock.begins).toBe(1);
    expect(lock.rollbacks).toBe(1);
    expect(lock.commits).toBe(0);
    expect(lock.depth).toBe(0);
    expect(lock.lastError?.message).toBe("boom");
  });
});
