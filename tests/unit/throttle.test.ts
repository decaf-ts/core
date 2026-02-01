import { throttle } from "../../src/utils/throttling";
import { Context } from "../../src/persistence/Context";
import { Logging } from "@decaf-ts/logging";

describe("throttle decorator", () => {
  class BulkHandler {
    ctx = new Context();
    callArgs: number[][] = [];
    constructor() {
      this.ctx.accumulate({ breakOnSingleFailureInBulk: true });
    }

    logCtx = async (args: unknown[]) => {
      const response: any = {
        log: Logging.get(),
        ctx: this.ctx,
        ctxArgs: args,
      };
      response.for = () => response;
      return response;
    };

    @throttle({ count: 2 })
    async create(items: number[]) {
      this.callArgs.push([...items]);
      return items.map((value) => value * 2);
    }
  }

  it("splits input into chunks by count and merges the results", async () => {
    const handler = new BulkHandler();
    const result = await handler.create([1, 2, 3], handler.ctx);
    expect(handler.callArgs).toEqual([
      [1, 2],
      [3],
    ]);
    expect(result).toEqual([2, 4, 6]);
  });

  it("continues processing even when a chunk fails if break flag is false", async () => {
    class FailureHandler {
      ctx = new Context();
      calls: number[][] = [];
      constructor() {
        this.ctx.accumulate({ breakOnSingleFailureInBulk: true });
      }
      logCtx = async (args: unknown[]) => {
        const response: any = {
          log: Logging.get(),
          ctx: this.ctx,
          ctxArgs: args,
        };
        response.for = () => response;
        return response;
      };

      @throttle({ count: 1 })
      async create(items: number[]) {
        this.calls.push([...items]);
        if (items[0] === 2) {
          throw new Error("boom");
        }
        return items;
      }
    }

    const handler = new FailureHandler();
    handler.ctx.accumulate({ breakOnSingleFailureInBulk: false });
    let caught: any;
    try {
      await handler.create([1, 2, 3], handler.ctx);
    } catch (err) {
      caught = err;
    }
    expect(handler.calls).toEqual([[1], [2], [3]]);
    expect(caught).toBeInstanceOf(AggregateError);
    expect(caught.results).toEqual([1, 3]);
  });
});
