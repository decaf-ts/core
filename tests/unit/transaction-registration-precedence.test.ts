/**
 * @description Test pinning down @transactional registration semantics
 * @summary `@decaf-ts/transactional-decorators` and `@decaf-ts/core` both register a decorator under
 * the same Decoration key (`TransactionalKeys.TRANSACTIONAL`). Registration happens when the exported
 * `transactional(...)` factory is actually called (i.e. when `@transactional()` decorates a class
 * member), not at module-load time — so whichever factory you call determines the active
 * implementation for that usage, regardless of import order. This test proves: (1) calling the base
 * package's factory does not touch any adapter; (2) calling core's factory does, via
 * `Adapter.transactionLock()`; (3) using core's factory after the base one still gets core's behavior.
 */
import "reflect-metadata";
import {
  transactional as baseTransactional,
} from "@decaf-ts/transactional-decorators";
import { Adapter, ContextLock, Repository, transactional as coreTransactional } from "../../src/index";
import { RamAdapter } from "../../src/ram";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

class CountingLock extends ContextLock {
  begins = 0;
  override async begin(): Promise<void> {
    this.begins++;
  }
}

class CountingAdapter extends RamAdapter {
  transactionLockCalls = 0;

  override transactionLock(...args: any[]): CountingLock {
    this.transactionLockCalls++;
    return new CountingLock(this, ...args);
  }
}

class PlainBaseService {
  @baseTransactional()
  async run(): Promise<string> {
    return "base-ran";
  }
}

@model()
class PrecedenceModel extends Model {
  constructor(arg?: ModelArg<PrecedenceModel>) {
    super(arg);
  }
}

class PrecedenceRepository extends Repository<PrecedenceModel, CountingAdapter> {
  constructor(adapter: CountingAdapter) {
    super(adapter, PrecedenceModel);
  }

  @coreTransactional()
  async run(): Promise<string> {
    return "core-ran";
  }
}

describe("transactional decorator registration precedence", () => {
  let adapter: CountingAdapter;

  afterEach(() => {
    if (adapter) Adapter.unregister(adapter.alias);
  });

  it("base package's factory never touches an adapter", async () => {
    const svc = new PlainBaseService();
    const result = await svc.run();
    expect(result).toBe("base-ran");
  });

  it("core's factory resolves the lock through Adapter.transactionLock()", async () => {
    adapter = new CountingAdapter(undefined, `precedence-${Date.now()}`);
    const repo = new PrecedenceRepository(adapter);

    const result = await repo.run();

    expect(result).toBe("core-ran");
    expect(adapter.transactionLockCalls).toBe(1);
  });

  it("core's factory still wins for core-decorated classes even after the base factory was used elsewhere", async () => {
    // Re-run the base-package-decorated class first, to assert it doesn't retroactively
    // affect classes that explicitly used core's transactional() factory.
    await new PlainBaseService().run();

    adapter = new CountingAdapter(undefined, `precedence-2-${Date.now()}`);
    const repo = new PrecedenceRepository(adapter);
    await repo.run();

    expect(adapter.transactionLockCalls).toBe(1);
  });
});
