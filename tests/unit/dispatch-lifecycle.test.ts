/**
 * Dispatch lifecycle: a dispatcher that listens to a backend (changes feed,
 * event stream, ...) starts asynchronously. Closing it — the last observer
 * leaving, or the adapter shutting down — must leave nothing behind: a start
 * still in flight is abandoned (it never connects), close() resolves only once
 * that start settled, and a shut-down adapter stays closed until initialized
 * again. Failures must be logged, never surface as unhandled rejections.
 */
import { RamAdapter } from "../../src/ram/index";
import { Dispatch } from "../../src/persistence/Dispatch";

type Gate = { release: () => void; fail: (e: Error) => void };

/** "connects" once the test releases its start, unless it was closed meanwhile */
class ConnectingDispatch extends Dispatch<any> {
  gates: Gate[] = [];
  starts = 0;
  connections = 0;
  failOnClose = false;

  protected override async initialize(): Promise<void> {
    this.starts++;
    const generation = this.currentGeneration();
    await new Promise<void>((resolve, reject) =>
      this.gates.push({ release: resolve, fail: reject })
    );
    if (this.isSuperseded(generation)) return;
    this.connections++;
  }

  override async close(...args: any[]): Promise<void> {
    await super.close(...(args as []));
    this.connections = 0;
    if (this.failOnClose) throw new Error("close failed");
  }
}

let aliasSeq = 0;

class ConnectingAdapter extends RamAdapter {
  readonly events = new ConnectingDispatch();

  constructor() {
    super({} as any, `dispatch-lifecycle-${++aliasSeq}`);
  }

  protected override Dispatch(): any {
    return this.events;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const observer = () => ({ refresh: async () => undefined }) as any;

describe("Dispatch lifecycle", () => {
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    unhandled = [];
    process.on("unhandledRejection", onUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  it("close() waits for a start in flight, which then never connects", async () => {
    const adapter = new ConnectingAdapter();
    adapter.observe(observer());
    await tick();
    expect(adapter.events.starts).toBe(1);

    let closed = false;
    const closing = adapter.events.close().then(() => (closed = true));
    await tick();
    expect(closed).toBe(false);

    adapter.events.gates[0].release();
    await closing;
    await tick();
    expect(adapter.events.connections).toBe(0);
  });

  it("shutdown() during a start in flight abandons it and resolves after it settled", async () => {
    const adapter = new ConnectingAdapter();
    adapter.observe(observer());
    await tick();

    let done = false;
    const shutting = adapter.shutdown().then(() => (done = true));
    await tick();
    expect(done).toBe(false);

    adapter.events.gates[0].release();
    await shutting;
    await tick();
    expect(adapter.events.connections).toBe(0);
  });

  it("a shut-down adapter stays closed, even when observed, until initialized again", async () => {
    const adapter = new ConnectingAdapter();
    adapter.observe(observer());
    await tick();
    adapter.events.gates[0].release();
    await tick();
    expect(adapter.events.connections).toBe(1);

    await adapter.shutdown();
    expect(adapter.events.connections).toBe(0);

    adapter.observe(observer());
    await tick();
    expect(adapter.events.starts).toBe(1);

    const initializing = adapter.initialize();
    await tick();
    expect(adapter.events.starts).toBe(2);
    adapter.events.gates[1].release();
    await initializing;
    expect(adapter.events.connections).toBe(1);
  });

  it("initialize() without a prior shutdown does not start the dispatch again", async () => {
    const adapter = new ConnectingAdapter();
    adapter.observe(observer());
    await tick();
    adapter.events.gates[0].release();
    await tick();

    await adapter.initialize();
    await tick();
    expect(adapter.events.starts).toBe(1);
    expect(adapter.events.connections).toBe(1);
  });

  it("logs a failing start instead of leaving an unhandled rejection", async () => {
    const adapter = new ConnectingAdapter();
    adapter.observe(observer());
    await tick();

    adapter.events.gates[0].fail(new Error("backend unavailable"));
    await tick();
    expect(unhandled).toEqual([]);
    expect(adapter.events.connections).toBe(0);
  });

  it("logs a failing close when the last observer leaves instead of leaving an unhandled rejection", async () => {
    const adapter = new ConnectingAdapter();
    const stop = adapter.observe(observer());
    await tick();
    adapter.events.gates[0].release();
    await tick();

    adapter.events.failOnClose = true;
    stop();
    await tick();
    expect(unhandled).toEqual([]);
  });
});
