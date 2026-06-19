/**
 * @description End-to-end test of @transactional through a real Repository+RamAdapter CRUD flow
 * @summary Verifies that wrapping real create/read operations in @transactional doesn't break normal
 * CRUD behavior, and that the transaction lock wraps the whole multi-step operation exactly once.
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

  override async begin(): Promise<void> {
    this.begins++;
  }

  override async commit(): Promise<void> {
    this.commits++;
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
class TxIntegrationModel extends Model {
  @pk()
  id!: number;

  @required()
  name!: string;

  constructor(arg?: ModelArg<TxIntegrationModel>) {
    super(arg);
  }
}

class TxIntegrationRepository extends Repository<
  TxIntegrationModel,
  CountingAdapter
> {
  constructor(adapter: CountingAdapter) {
    super(adapter, TxIntegrationModel);
  }

  @transactional()
  async createPair(
    first: TxIntegrationModel,
    second: TxIntegrationModel,
    ...args: any[]
  ): Promise<[TxIntegrationModel, TxIntegrationModel]> {
    const createdFirst = await this.create(first, ...args);
    const createdSecond = await this.create(second, ...args);
    return [createdFirst, createdSecond];
  }
}

describe("@transactional end-to-end with RamAdapter", () => {
  let adapter: CountingAdapter;

  afterEach(async () => {
    if (adapter) {
      Adapter.unregister(adapter.alias);
    }
  });

  it("performs real CRUD inside a single shared transaction", async () => {
    adapter = new CountingAdapter(undefined, `tx-integration-${Date.now()}`);
    const repo = new TxIntegrationRepository(adapter);

    const [created1, created2] = await repo.createPair(
      new TxIntegrationModel({ id: 1, name: "first" }),
      new TxIntegrationModel({ id: 2, name: "second" })
    );

    expect(created1.name).toBe("first");
    expect(created2.name).toBe("second");

    const read1 = await repo.read(1);
    const read2 = await repo.read(2);
    expect(read1.name).toBe("first");
    expect(read2.name).toBe("second");

    expect(adapter.locksHanded.length).toBe(1);
    expect(adapter.locksHanded[0].begins).toBe(1);
    expect(adapter.locksHanded[0].commits).toBe(1);
    expect(adapter.locksHanded[0].depth).toBe(0);
  });
});
