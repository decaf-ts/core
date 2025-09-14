import "reflect-metadata";
import {
  RepositoryFlags,
  Context,
  InternalError,
  BaseError,
} from "@decaf-ts/db-decorators";
import { Adapter, Sequence, SequenceOptions, Statement } from "../../src/index";
import { Model } from "@decaf-ts/decorator-validation/lib/model";

class DummyContext<F extends RepositoryFlags> extends Context<F> {}

type Cfg = { url: string };

type F = RepositoryFlags;

class TestRemoteAdapter extends Adapter<
  Cfg,
  { connected: boolean },
  any,
  F,
  DummyContext<F>
> {
  Statement<M extends Model>(): Statement<any, M, any> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseError(err: Error): BaseError {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Sequence(options: SequenceOptions): Promise<Sequence> {
    throw new Error("Method not implemented.");
  }
  create(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string | number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<Record<string, any>> {
    throw new Error("Method not implemented.");
  }
  read(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string | number | bigint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<Record<string, any>> {
    throw new Error("Method not implemented.");
  }
  update(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string | number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    model: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<Record<string, any>> {
    throw new Error("Method not implemented.");
  }
  delete(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: string | number | bigint,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: any[]
  ): Promise<Record<string, any>> {
    throw new Error("Method not implemented.");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  raw<R>(rawInput: any, ...args: any[]): Promise<R> {
    throw new Error("Method not implemented.");
  }
  constructor(cfg: Cfg, alias = "dummy") {
    super(cfg, "remote", alias);
  }

  protected getClient(): { connected: boolean } {
    return { connected: true };
  }

  async shutdown(): Promise<void> {
    // no-op
  }
}

describe("persistence/RemoteAdapter", () => {
  it("memoizes client and exposes proxied _native & _client via for()", async () => {
    const base = new TestRemoteAdapter({ url: "http://a" }, "base");

    // client getter memoizes
    const c1 = base.client;
    const c2 = base.client;
    expect(c1).toBe(c2);
    expect(c1.connected).toBe(true);

    // create proxy with partial config
    const proxy = base.for({ url: "http://b" });
    // _native on proxy should merge config
    const n = (proxy as any)._config as Cfg;
    expect(n.url).toBe("http://b");

    // set _client through proxy reflective setter and read back
    (proxy as any)._client = { connected: false };
    expect((proxy as any).client.connected).toBe(false);

    // same for() arguments should return same proxy instance
    const proxy2 = base.for({ url: "http://b" });
    expect(proxy2).toBe(proxy);
  });

  it("shutdownProxies handles missing key, single and all", async () => {
    const base = new TestRemoteAdapter({ url: "http://a" }, "second");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const p1 = base.for({ url: "x" });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const p2 = base.for({ url: "y" });

    // calling with a non-existent key should throw
    await expect(
      base["shutdownProxies"].call(base, "missing")
    ).rejects.toBeInstanceOf(InternalError);

    // find actual proxy keys
    const keys = Object.keys((base as any).proxies);
    expect(keys.length).toBeGreaterThanOrEqual(2);

    // shutdown one
    await (base as any).shutdownProxies(keys[0]);
    expect(Object.keys((base as any).proxies)).toContain(keys[1]);

    // shutdown all
    await (base as any).shutdownProxies();
    expect(Object.keys((base as any).proxies)).toHaveLength(0);

    // ensure shutdown() exists
    await base.shutdown();
  });
});
