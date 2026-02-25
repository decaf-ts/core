import { Lock } from "@decaf-ts/transactional-decorators";
import { type Adapter } from "./Adapter";
import { InternalError } from "@decaf-ts/db-decorators";

export class AdapterTransaction<A extends Adapter<any, any, any, any>> {
  constructor(
    protected adapter: A,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async begin(...args: any[]) {
    // do nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async commit(...args: any[]) {
    //do nothing
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async rollback(...args: any[]) {
    // do nothing
  }
}

export class ContextLock extends Lock {
  private acquireCount: number = 0;
  protected readonly lock: Lock = new Lock();

  constructor(protected adapterTransaction: AdapterTransaction<any>) {
    super();
  }

  override async acquire(...args: any[]): Promise<void> {
    await this.lock.acquire();
    this.acquireCount++;
    if (this.acquireCount === 1) {
      this.lock.release();
      await this.adapterTransaction.begin(...args);
    } else {
      this.lock.release();
    }
  }

  override async release(...args: any[]): Promise<void> {
    await this.lock.acquire();
    this.acquireCount--;
    if (this.acquireCount === 0) {
      try {
        await this.adapterTransaction.commit(...args);
      } catch (e: unknown) {
        await this.adapterTransaction.rollback(
          new InternalError(`Failed to submit transaction: ${e}`),
          ...args
        );
      } finally {
        this.lock.release();
      }
    } else if (this.acquireCount < 0) {
      this.acquireCount = 0;
      this.lock.release();
    } else {
      this.lock.release();
    }
  }

  async rollback(e: Error, ...args: any[]): Promise<void> {
    await this.lock.acquire();
    try {
      await this.adapterTransaction.rollback(
        new InternalError(`Failed to submit transaction: ${e}`),
        ...args
      );
    } catch (e: unknown) {
      throw new InternalError(`Failed to rollback transaction: ${e}`);
    } finally {
      this.lock.release();
    }
  }
}
