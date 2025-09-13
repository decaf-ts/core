import { AuthorizationError, ForbiddenError, ConnectionError } from "../../src/utils/errors";

describe("utils/errors", () => {
  test("AuthorizationError wraps message and sets code 401", () => {
    const err = new AuthorizationError("not authorized");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("AuthorizationError");
    expect((err as any).code).toBe(401);
  });

  test("AuthorizationError wraps inner Error and preserves stack", () => {
    const inner = new Error("bad auth");
    const err = new AuthorizationError(inner);
    expect(err.message).toContain("bad auth");
    expect((err as any).code).toBe(401);
    expect(err.stack).toBe(inner.stack);
  });

  test("ForbiddenError sets code 403", () => {
    const err = new ForbiddenError("forbidden");
    expect(err.message).toContain("ForbiddenError");
    expect((err as any).code).toBe(403);
  });

  test("ConnectionError sets code 503", () => {
    const err = new ConnectionError("down");
    expect(err.message).toContain("ConnectionError");
    expect((err as any).code).toBe(503);
  });
});
