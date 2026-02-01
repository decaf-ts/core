import { Condition } from "../../src/query/Condition";
import { Model } from "@decaf-ts/decorator-validation";

class TestModel extends Model {
  id!: string;
  name!: string;
  age!: number;
}

describe("AttributeOption Interface", () => {
  it("allows between() to be called on Condition.attr()", () => {
    // This should compile without errors
    const condition = Condition.attr<TestModel>("age").between(18, 65);
    expect(condition).toBeDefined();
  });

  it("allows in() to be called on Condition.attr()", () => {
    // This should compile without errors
    const condition = Condition.attr<TestModel>("age").in([18, 25, 30, 40]);
    expect(condition).toBeDefined();
  });

  it("supports all operators on Condition.attr()", () => {
    const attr = Condition.attr<TestModel>("age");

    // All these should compile
    expect(attr.eq(25)).toBeDefined();
    expect(attr.dif(25)).toBeDefined();
    expect(attr.gt(18)).toBeDefined();
    expect(attr.lt(65)).toBeDefined();
    expect(attr.gte(18)).toBeDefined();
    expect(attr.lte(65)).toBeDefined();
    expect(attr.in([18, 25, 30])).toBeDefined();
    expect(attr.between(18, 65)).toBeDefined();
    expect(attr.regexp("^test")).toBeDefined();
    expect(attr.startsWith("test")).toBeDefined();
    expect(attr.endsWith("test")).toBeDefined();
  });
});
