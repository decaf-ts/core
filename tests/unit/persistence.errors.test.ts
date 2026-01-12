import { UnsupportedError } from "../../src/persistence/errors";
import { InternalError } from "@decaf-ts/db-decorators";

describe("persistence/errors", () => {
  it("UnsupportedError wraps message and sets code 500", () => {
    const err = new UnsupportedError("nope");
    expect(err).toBeInstanceOf(InternalError);
    expect(err.message).toBe(`[UnsupportedError][500] nope`);
    expect(err.code).toBe(500);
  });

  it("UnsupportedError wraps inner error and preserves stack", () => {
    const inner = new Error("inner");
    const err = new UnsupportedError(inner);
    expect(err.message).toBe(`[UnsupportedError][500] inner`);
    expect(err.stack).toBe(inner.stack);
  });
});
