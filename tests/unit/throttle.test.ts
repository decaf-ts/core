import {
  throttle,
  ThrottleMode,
  ThrottleSplitter,
  splitByCount,
  splitBySize,
} from "../../src/utils/throttling";
import { Context } from "../../src/persistence/Context";
import { Logging } from "@decaf-ts/logging";

// ---------------------------------------------------------------------------
// Shared test harness
// ---------------------------------------------------------------------------

function makeLogCtx(ctx: Context) {
  return async (args: unknown[]) => {
    const r: any = { log: Logging.get(), ctx, ctxArgs: args };
    r.for = () => r;
    return r;
  };
}

// ---------------------------------------------------------------------------
// splitByCount — unit tests for the factory
// ---------------------------------------------------------------------------

describe("splitByCount", () => {
  it("splits evenly", () => {
    const split = splitByCount<number>(2);
    expect(split([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]]);
  });

  it("handles a remainder chunk", () => {
    const split = splitByCount<number>(2);
    expect(split([1, 2, 3])).toEqual([[1, 2], [3]]);
  });

  it("returns a single chunk when array fits", () => {
    const split = splitByCount<number>(10);
    expect(split([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("returns empty array for empty input", () => {
    const split = splitByCount<number>(2);
    expect(split([])).toEqual([]);
  });

  it("throws when count is zero", () => {
    expect(() => splitByCount(0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// splitBySize — unit tests for the factory
// ---------------------------------------------------------------------------

describe("splitBySize", () => {
  it("keeps items together when total size fits", () => {
    const split = splitBySize<string>(1000);
    expect(split(["a", "b", "c"])).toEqual([["a", "b", "c"]]);
  });

  it("splits when accumulated size exceeds limit", () => {
    // Each JSON-encoded 3-char string is ~5 bytes ("\"abc\"")
    const split = splitBySize<string>(10);
    const result = split(["abc", "def", "ghi", "jkl"]);
    expect(result.length).toBeGreaterThan(1);
    expect(result.flat()).toEqual(["abc", "def", "ghi", "jkl"]);
  });

  it("puts an oversized single item in its own chunk", () => {
    const bigItem = "x".repeat(500);
    const split = splitBySize<string>(10);
    const result = split([bigItem]);
    expect(result).toEqual([[bigItem]]);
  });

  it("returns empty array for empty input", () => {
    const split = splitBySize<number>(100);
    expect(split([])).toEqual([]);
  });

  it("throws when maxBytes is zero", () => {
    expect(() => splitBySize(0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — BY_COUNT mode (default)
// ---------------------------------------------------------------------------

describe("@throttle — BY_COUNT (default)", () => {
  it("@throttle(2) splits array into count-2 chunks and merges results", async () => {
    const ctx = new Context();
    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(2)
      async process(items: number[]) {
        this.calls.push([...items]);
        return items.map((v) => v * 2);
      }
    }
    const h = new Handler();
    const result = await h.process([1, 2, 3], ctx as any);
    expect(h.calls).toEqual([[1, 2], [3]]);
    expect(result).toEqual([2, 4, 6]);
  });

  it("@throttle(N, ThrottleMode.BY_COUNT) is equivalent to @throttle(N)", async () => {
    const ctx = new Context();
    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(2, ThrottleMode.BY_COUNT)
      async process(items: number[]) {
        this.calls.push([...items]);
        return items;
      }
    }
    const h = new Handler();
    const result = await h.process([1, 2, 3, 4], ctx as any);
    expect(h.calls).toEqual([[1, 2], [3, 4]]);
    expect(result).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — BY_SIZE mode
// ---------------------------------------------------------------------------

describe("@throttle — BY_SIZE mode", () => {
  it("chunks respect byte limit", async () => {
    const ctx = new Context();
    class Handler {
      calls: string[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(12, ThrottleMode.BY_SIZE)
      async process(items: string[]) {
        this.calls.push([...items]);
        return items;
      }
    }
    const h = new Handler();
    // "\"abc\"" = 5 bytes each; two fit in 12 bytes, three would be 15
    const result = await h.process(["abc", "def", "ghi", "jkl"], ctx as any);
    expect(h.calls.length).toBeGreaterThan(1);
    expect(result).toEqual(["abc", "def", "ghi", "jkl"]);
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — custom splitter
// ---------------------------------------------------------------------------

describe("@throttle — custom ThrottleSplitter", () => {
  it("uses the provided splitter function", async () => {
    const ctx = new Context();
    const customSplitter: ThrottleSplitter<number> = (items) => [
      items.filter((_, i) => i % 2 === 0),
      items.filter((_, i) => i % 2 !== 0),
    ];

    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(customSplitter)
      async process(items: number[]) {
        this.calls.push([...items]);
        return items;
      }
    }
    const h = new Handler();
    const result = await h.process([1, 2, 3, 4], ctx as any);
    expect(h.calls).toEqual([[1, 3], [2, 4]]);
    expect(result).toEqual([1, 3, 2, 4]);
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — delayMs option
// ---------------------------------------------------------------------------

describe("@throttle — delayMs option", () => {
  it("calls setTimeout between chunks", async () => {
    jest.useFakeTimers();
    const ctx = new Context();
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");

    class Handler {
      logCtx = makeLogCtx(ctx);

      @throttle(1, { delayMs: 100 })
      async process(items: number[]) {
        return items;
      }
    }
    const h = new Handler();
    const promise = h.process([1, 2], ctx as any);
    await jest.runAllTimersAsync();
    await promise;

    const delayedCalls = setTimeoutSpy.mock.calls.filter(
      ([, ms]) => ms === 100
    );
    expect(delayedCalls.length).toBeGreaterThanOrEqual(1);

    setTimeoutSpy.mockRestore();
    jest.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — failure handling
// ---------------------------------------------------------------------------

describe("@throttle — failure handling", () => {
  it("aborts on first failure when breakOnSingleFailure=true (default)", async () => {
    const ctx = new Context();
    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(1)
      async process(items: number[]) {
        this.calls.push([...items]);
        if (items[0] === 2) throw new Error("boom");
        return items;
      }
    }
    const h = new Handler();
    await expect(h.process([1, 2, 3], ctx as any)).rejects.toThrow("boom");
    expect(h.calls).toEqual([[1], [2]]);
  });

  it("aggregates errors when breakOnSingleFailure=false", async () => {
    const ctx = new Context();
    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(1, { breakOnSingleFailure: false })
      async process(items: number[]) {
        this.calls.push([...items]);
        if (items[0] === 2) throw new Error("boom");
        return items;
      }
    }
    const h = new Handler();
    let caught: any;
    try {
      await h.process([1, 2, 3], ctx as any);
    } catch (e) {
      caught = e;
    }
    expect(h.calls).toEqual([[1], [2], [3]]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught.results).toEqual([1, 3]);
  });

  it("respects breakOnSingleFailure from context when not in options", async () => {
    const ctx = new Context();
    ctx.accumulate({ breakOnSingleFailureInBulk: false });

    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(1)
      async process(items: number[]) {
        this.calls.push([...items]);
        if (items[0] === 2) throw new Error("boom");
        return items;
      }
    }
    const h = new Handler();
    let caught: any;
    try {
      await h.process([1, 2, 3], ctx as any);
    } catch (e) {
      caught = e;
    }
    expect(h.calls).toEqual([[1], [2], [3]]);
    expect(caught).toBeInstanceOf(AggregateError);
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — multi-index arg support
// ---------------------------------------------------------------------------

describe("@throttle — multi-index args", () => {
  it("co-chunks two parallel arrays", async () => {
    const ctx = new Context();
    class Handler {
      calls: [string[], number[]][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(2, { argIndex: [0, 1] })
      async process(ids: string[], values: number[]) {
        this.calls.push([[...ids], [...values]]);
        return ids.map((id, i) => ({ id, value: values[i] }));
      }
    }
    const h = new Handler();
    const result = await h.process(
      ["a", "b", "c"],
      [10, 20, 30],
      ctx as any
    );
    expect(h.calls).toEqual([
      [["a", "b"], [10, 20]],
      [["c"], [30]],
    ]);
    expect(result).toEqual([
      { id: "a", value: 10 },
      { id: "b", value: 20 },
      { id: "c", value: 30 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// @throttle decorator — edge cases
// ---------------------------------------------------------------------------

describe("@throttle — edge cases", () => {
  it("passes through an empty array with a single call", async () => {
    const ctx = new Context();
    class Handler {
      calls: number[][] = [];
      logCtx = makeLogCtx(ctx);

      @throttle(2)
      async process(items: number[]) {
        this.calls.push([...items]);
        return items;
      }
    }
    const h = new Handler();
    const result = await h.process([], ctx as any);
    expect(h.calls).toEqual([[]]);
    expect(result).toEqual([]);
  });
});
