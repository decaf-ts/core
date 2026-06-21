import { InternalError } from "@decaf-ts/db-decorators";
import { allowIf, blockIf } from "../../src/auth/decorators";
import { AuthorizationError } from "../../src/utils/errors";
import { UnsupportedError } from "../../src/persistence/errors";

type DecoratorFactory = typeof allowIf;

function makeFixture(
  decoratorFactory: DecoratorFactory,
  handler: (...args: any[]) => any
) {
  class Fixture {
    public logCtx = jest.fn(async (args: any[], methodName: string) => ({
      ctx: { methodName, args },
      ctxArgs: args,
    }));

    public calls: any[] = [];

    @decoratorFactory(handler)
    async execute(value: string) {
      this.calls.push(value);
      return `handled:${value}`;
    }
  }
  return Fixture;
}

describe.each([
  ["allowIf", allowIf],
  ["blockIf", blockIf],
] as const)("auth decorators: %s", (_decoratorName, decoratorFactory) => {
  it("allows the method when the handler returns nothing", async () => {
    const handler = jest.fn(() => void 0);
    const Fixture = makeFixture(decoratorFactory, handler);
    const sut = new Fixture();

    await expect(sut.execute("value")).resolves.toBe("handled:value");
    expect(handler).toHaveBeenCalledWith("value", {
      methodName: "execute",
      args: ["value"],
    });
    expect(sut.calls).toEqual(["value"]);
    expect(sut.logCtx).toHaveBeenCalledWith(["value"], "execute", true);
  });

  it("propagates AuthorizationError returned by the handler", async () => {
    const authError = new AuthorizationError("denied");
    const handler = jest.fn(() => authError);
    const Fixture = makeFixture(decoratorFactory, handler);
    const sut = new Fixture();

    await expect(sut.execute("value")).rejects.toBe(authError);
    expect(sut.calls).toEqual([]);
  });

  it("wraps handler throws in InternalError", async () => {
    const handler = jest.fn(() => {
      throw new Error("boom");
    });
    const Fixture = makeFixture(decoratorFactory, handler);
    const sut = new Fixture();

    const result = sut.execute("value");
    await expect(result).rejects.toBeInstanceOf(InternalError);
    await expect(result).rejects.toThrow(
      "Failed to execute auth validation handler: Error: boom"
    );
  });

  it("throws UnsupportedError when logCtx is missing", async () => {
    const handler = jest.fn(() => void 0);

    class NoLogCtxFixture {
      @decoratorFactory(handler)
      async execute() {
        return "handled";
      }
    }

    const sut = new NoLogCtxFixture();
    const result = sut.execute();
    await expect(result).rejects.toBeInstanceOf(UnsupportedError);
    await expect(result).rejects.toThrow(
      `${_decoratorName} on NoLogCtxFixture.execute requires a logCtx() method`
    );
    expect(handler).not.toHaveBeenCalled();
  });
});
