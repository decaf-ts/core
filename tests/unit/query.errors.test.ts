import { PagingError, QueryError } from "../../src/query/errors";
import { BaseError } from "@decaf-ts/db-decorators";

describe("query/errors", () => {
  it("QueryError formats message and code", () => {
    const e = new QueryError("bad");
    expect(e).toBeInstanceOf(BaseError as any);
    expect(e.message).toBe("[QueryError] bad");
    expect(e.code).toBe(500);
  });

  it("PagingError formats message and code", () => {
    const e = new PagingError(new Error("oops"));
    expect(e.message).toBe("[PagingError] oops");
    expect(e.code).toBe(500);
  });
});
