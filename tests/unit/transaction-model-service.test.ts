/**
 * @description Test for transaction-lock survival through ModelService/Service.context()
 * @summary Service (and ModelService) has its own separate context()/flags() implementation
 * (core/src/services/services.ts), independent from Adapter.context(). This verifies that
 * nested @transactional() calls rooted on a ModelService also reuse a single transaction lock.
 */
import "reflect-metadata";
import {
  Adapter,
  ContextLock,
  ModelService,
  Repository,
  repository,
  transactional,
} from "../../src/index";
import { RamAdapter } from "../../src/ram";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

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
class SvcModel extends Model {
  constructor(arg?: ModelArg<SvcModel>) {
    super(arg);
  }
}

describe("ModelService transaction sharing", () => {
  let adapter: CountingAdapter;

  afterEach(() => {
    if (adapter) Adapter.unregister(adapter.alias);
  });

  it("reuses the same transaction lock across nested @transactional calls on a ModelService", async () => {
    adapter = new CountingAdapter(undefined, `counting-svc-${Date.now()}`);

    @repository(SvcModel)
    class SvcRepository extends Repository<SvcModel, CountingAdapter> {
      constructor(adp: CountingAdapter = adapter) {
        super(adp, SvcModel);
      }
    }

    class SvcService extends ModelService<SvcModel, SvcRepository> {
      constructor() {
        super(SvcModel);
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

    const service = new SvcService();
    await service.outer();

    expect(adapter.locksHanded.length).toBe(1);
    expect(adapter.locksHanded[0].begins).toBe(1);
    expect(adapter.locksHanded[0].commits).toBe(1);
    expect(adapter.locksHanded[0].depth).toBe(0);
  });
});
