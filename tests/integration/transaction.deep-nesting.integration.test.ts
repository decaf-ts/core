/**
 * @description End-to-end test of @transactional with deep nesting and real CRUD operations
 * @summary Verifies that 3+ levels of nested @transactional calls, each performing several
 * create/read/update operations, all share exactly one ContextLock instance - i.e. begin/commit
 * are each called exactly once for the whole call tree, regardless of nesting depth or how many
 * operations happen at each level. Also verifies that an error thrown at the deepest level triggers
 * exactly one rollback (not one per nesting level).
 */
import "reflect-metadata";
import {
  Adapter,
  ContextLock,
  pk,
  Repository,
  transactional,
} from "../../src/index";
import { RamAdapter } from "../../src/ram";
import {
  Model,
  model,
  type ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

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
class DeepTxModel extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  constructor(arg?: ModelArg<DeepTxModel>) {
    super(arg);
  }
}

class DeepTxRepository extends Repository<DeepTxModel, CountingAdapter> {
  constructor(adapter: CountingAdapter) {
    super(adapter, DeepTxModel);
  }

  @transactional()
  async levelOne(...args: any[]): Promise<DeepTxModel[]> {
    const a = await this.create(new DeepTxModel({ id: 1, name: "l1-a" }), ...args);
    const b = await this.create(new DeepTxModel({ id: 2, name: "l1-b" }), ...args);
    const fromTwo = await this.levelTwo(...args);
    return [a, b, ...fromTwo];
  }

  @transactional()
  async levelTwo(...args: any[]): Promise<DeepTxModel[]> {
    const a = await this.create(new DeepTxModel({ id: 3, name: "l2-a" }), ...args);
    const b = await this.create(new DeepTxModel({ id: 4, name: "l2-b" }), ...args);
    const existing = await this.read(1, ...args);
    const updated = await this.update(
      new DeepTxModel(
        Object.assign({}, existing, { name: "l2-updated-1" })
      ),
      ...args
    );
    const fromThree = await this.levelThree(...args);
    return [a, b, updated, ...fromThree];
  }

  @transactional()
  async levelThree(...args: any[]): Promise<DeepTxModel[]> {
    const a = await this.create(new DeepTxModel({ id: 5, name: "l3-a" }), ...args);
    const b = await this.create(new DeepTxModel({ id: 6, name: "l3-b" }), ...args);
    return [a, b];
  }

  @transactional()
  async levelTwoThatFails(...args: any[]): Promise<void> {
    await this.create(new DeepTxModel({ id: 7, name: "l2-fail-a" }), ...args);
    await this.levelThreeThatFails(...args);
  }

  @transactional()
   
  async levelThreeThatFails(...args: any[]): Promise<void> {
    await this.create(new DeepTxModel({ id: 8, name: "l3-fail-a" }), ...args);
    throw new Error("boom at the deepest level");
  }
}

describe("@transactional deep nesting with real CRUD", () => {
  let adapter: CountingAdapter;

  afterEach(async () => {
    if (adapter) {
      Adapter.unregister(adapter.alias);
    }
  });

  it("shares a single transaction lock across 3 nesting levels with several operations per level", async () => {
    adapter = new CountingAdapter(undefined, `deep-tx-${Date.now()}`);
    const repo = new DeepTxRepository(adapter);

    const results = await repo.levelOne();
    expect(results).toHaveLength(7);

    const read1 = await repo.read(1);
    const read2 = await repo.read(2);
    const read3 = await repo.read(3);
    const read4 = await repo.read(4);
    const read5 = await repo.read(5);
    const read6 = await repo.read(6);

    expect(read1.name).toBe("l2-updated-1");
    expect(read2.name).toBe("l1-b");
    expect(read3.name).toBe("l2-a");
    expect(read4.name).toBe("l2-b");
    expect(read5.name).toBe("l3-a");
    expect(read6.name).toBe("l3-b");

    expect(adapter.locksHanded.length).toBe(1);
    const lock = adapter.locksHanded[0];
    expect(lock.begins).toBe(1);
    expect(lock.commits).toBe(1);
    expect(lock.rollbacks).toBe(0);
    expect(lock.depth).toBe(0);
  });

  it("performs exactly one rollback when the deepest nesting level throws", async () => {
    adapter = new CountingAdapter(undefined, `deep-tx-fail-${Date.now()}`);
    const repo = new DeepTxRepository(adapter);

    await expect(repo.levelTwoThatFails()).rejects.toThrow(
      "boom at the deepest level"
    );

    expect(adapter.locksHanded.length).toBe(1);
    const lock = adapter.locksHanded[0];
    expect(lock.begins).toBe(1);
    expect(lock.commits).toBe(0);
    expect(lock.rollbacks).toBe(1);
    expect(lock.depth).toBe(0);
  });
});
