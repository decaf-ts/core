import { ObserverError } from "../../src/repository/errors";

// Group related tests for repository errors

describe("repository/errors.ObserverError", () => {
  it("should extend Error and set proper code and formatted message when constructed with string", () => {
    const err = new ObserverError("failure");
    expect(err).toBeInstanceOf(Error);
    // BaseError sets the code and prefixes the message with the class name
    expect((err as any).code).toBe(500);
    expect(err.message).toBe("[ObserverError][500] failure");
  });

  it("should accept an Error instance and wrap its message", () => {
    const base = new Error("boom");
    const err = new ObserverError(base);
    expect(err.message).toBe("[ObserverError][500] boom");
  });
});
