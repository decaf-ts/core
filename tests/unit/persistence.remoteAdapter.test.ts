import "reflect-metadata";
import { RemoteAdapter } from "../../src/persistence/RemoteAdapter";
import { RepositoryFlags, Context, InternalError } from "@decaf-ts/db-decorators";

class DummyContext<F extends RepositoryFlags> extends Context<F> {}

type Cfg = { url: string };

type F = RepositoryFlags;

class TestRemoteAdapter extends RemoteAdapter<Cfg, { connected: boolean }, any, F, DummyContext<F>> {
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
    const n = (proxy as any)._native as Cfg;
    expect(n.url).toBe("http://b");

    // set _client through proxy reflective setter and read back
    (proxy as any)._client = { connected: false };
    expect((proxy as any).client.connected).toBe(false);

    // same for() arguments should return same proxy instance
    const proxy2 = base.for({ url: "http://b" });
    expect(proxy2).toBe(proxy);
  });

  it("shutdownProxies handles missing key, single and all", async () => {
    const base = new TestRemoteAdapter({ url: "http://a" }, "base");
    const p1 = base.for({ url: "x" });
    const p2 = base.for({ url: "y" });

    // calling with a non-existent key should throw
    await expect(base["shutdownProxies"].call(base, "missing")).rejects.toBeInstanceOf(InternalError);

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
