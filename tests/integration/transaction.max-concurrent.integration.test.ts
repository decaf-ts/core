/**
 * @description Integration tests for the default `ContextLock`'s `maxConcurrentTransactions` gating
 * @summary Verifies the default (non-overridden) `ContextLock` behavior driven by the
 * `maxConcurrentTransactions` `AdapterFlags` flag against a real `RamAdapter` + `@transactional()` call
 * tree: `-1` (default) never blocks, `0` rejects every transaction outright, and any positive number
 * gates concurrency through a counting semaphore shared by every transaction on that adapter.
 */
import "reflect-metadata";
import { Adapter, pk, Repository, transactional } from "../../src/index";
import { RamAdapter } from "../../src/ram";
import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

@model()
class MaxConcurrencyModel extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  constructor(arg?: ModelArg<MaxConcurrencyModel>) {
    super(arg);
  }
}

/**
 * @description Test-only knobs to pause a transaction mid-flight from outside
 * @summary Kept as plain instance fields, not method parameters, so they never enter the positional
 * argument list that `@transactional()`/`Adapter.context()` forwards into the Context's flags cache.
 */
class MaxConcurrencyRepository extends Repository<
  MaxConcurrencyModel,
  RamAdapter
> {
  onHeld?: () => void;
  gate?: Promise<void>;

  constructor(adapter: RamAdapter, force = false) {
    super(adapter, MaxConcurrencyModel, force);
  }

  @transactional()
  async holdTransaction(
    toCreate: MaxConcurrencyModel,
    ...args: any[]
  ): Promise<MaxConcurrencyModel> {
    const created = await this.create(toCreate, ...args);
    this.onHeld?.();
    await this.gate;
    return created;
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface Actor {
  repo: MaxConcurrencyRepository;
  held: Promise<void>;
  isHeld: () => boolean;
  release: () => void;
}

function makeActor(adapter: RamAdapter, maxConcurrentTransactions?: number): Actor {
  const base = new MaxConcurrencyRepository(adapter, true);
  const repo = (
    typeof maxConcurrentTransactions === "number"
      ? base.override({ maxConcurrentTransactions })
      : base
  ) as MaxConcurrencyRepository;

  const held = deferred();
  const gate = deferred();
  let isHeld = false;
  repo.onHeld = () => {
    isHeld = true;
    held.resolve();
  };
  repo.gate = gate.promise;

  return {
    repo,
    held: held.promise,
    isHeld: () => isHeld,
    release: gate.resolve,
  };
}

describe("default ContextLock maxConcurrentTransactions gating", () => {
  let adapter: RamAdapter;

  afterEach(async () => {
    if (adapter) Adapter.unregister(adapter.alias);
  });

  it("does not block any transaction when maxConcurrentTransactions=-1 (the default)", async () => {
    adapter = new RamAdapter(undefined, `max-concurrency-inf-${Date.now()}`);
    const actors = Array.from({ length: 5 }, () => makeActor(adapter));

    const runs = actors.map((actor, i) =>
      actor.repo.holdTransaction(
        new MaxConcurrencyModel({ id: i + 1, name: `actor-${i}` })
      )
    );

    await Promise.all(actors.map((actor) => actor.held));
    expect(actors.every((actor) => actor.isHeld())).toBe(true);

    actors.forEach((actor) => actor.release());
    await Promise.all(runs);
  });

  it("rejects every transaction when maxConcurrentTransactions=0", async () => {
    adapter = new RamAdapter(undefined, `max-concurrency-zero-${Date.now()}`);
    const actor = makeActor(adapter, 0);

    await expect(
      actor.repo.holdTransaction(
        new MaxConcurrencyModel({ id: 1, name: "blocked" })
      )
    ).rejects.toThrow(/disabled/i);
  });

  it("allows exactly one transaction at a time when maxConcurrentTransactions=1", async () => {
    adapter = new RamAdapter(undefined, `max-concurrency-one-${Date.now()}`);
    const a = makeActor(adapter, 1);
    const b = makeActor(adapter, 1);

    const runA = a.repo.holdTransaction(
      new MaxConcurrencyModel({ id: 1, name: "a" })
    );
    await a.held;

    const runB = b.repo.holdTransaction(
      new MaxConcurrencyModel({ id: 2, name: "b" })
    );
    // give B every chance to proceed before asserting it didn't
    await new Promise((r) => setTimeout(r, 50));
    expect(b.isHeld()).toBe(false);

    a.release();
    await runA;

    await b.held; // released now that A's transaction ended
    b.release();
    await runB;
  });

  it("allows exactly N concurrent transactions when maxConcurrentTransactions=3", async () => {
    adapter = new RamAdapter(undefined, `max-concurrency-three-${Date.now()}`);
    const actors = Array.from({ length: 4 }, () => makeActor(adapter, 3));

    const runs = actors.map((actor, i) =>
      actor.repo.holdTransaction(
        new MaxConcurrencyModel({ id: i + 1, name: `actor-${i}` })
      )
    );

    await Promise.all(actors.slice(0, 3).map((actor) => actor.held));
    await new Promise((r) => setTimeout(r, 50));
    expect(actors.slice(0, 3).every((actor) => actor.isHeld())).toBe(true);
    expect(actors[3].isHeld()).toBe(false);

    actors[0].release();
    await runs[0];

    await actors[3].held; // released once one of the first three committed
    actors.slice(1).forEach((actor) => actor.release());
    await Promise.all(runs.slice(1));
  });
});
