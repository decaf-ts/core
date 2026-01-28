/**
 * This test validates that the TypeScript interfaces are correctly defined
 * and that all the new features compile without errors
 */
import { Repository } from "../../src/repository/Repository";
import { Condition } from "../../src/query/Condition";
import { Model } from "@decaf-ts/decorator-validation";
import { pk } from "../../src";

class TestModel extends Model {
  @pk()
  id!: string;
  name!: string;
  age!: number;
  score!: number;
  createdAt!: Date;
}

describe("TypeScript Interface Validation", () => {
  // These tests verify that the code compiles with proper TypeScript types
  // The actual Repository methods won't be called, we're just testing compilation

  it("compiles: Condition.attr().between()", () => {
    // This should compile without TypeScript errors
    const condition = Condition.attr<TestModel>("age").between(18, 65);
    expect(condition).toBeDefined();
  });

  it("compiles: Condition.attr().in()", () => {
    // This should compile without TypeScript errors
    const condition = Condition.attr<TestModel>("age").in([18, 25, 30, 40]);
    expect(condition).toBeDefined();
  });

  it("compiles: complex condition with between and AND", () => {
    // This should compile without TypeScript errors
    const condition = Condition.attr<TestModel>("age")
      .between(18, 65)
      .and(Condition.attr<TestModel>("score").gt(50));
    expect(condition).toBeDefined();
  });

  it("compiles: complex condition with in and OR", () => {
    // This should compile without TypeScript errors
    const condition = Condition.attr<TestModel>("age")
      .in([18, 25, 30])
      .or(Condition.attr<TestModel>("score").gte(80));
    expect(condition).toBeDefined();
  });

  // Note: The following tests verify TypeScript compilation but won't execute
  // repository methods since we don't have an actual adapter instance

  it("type checks: Repository.count() chain", () => {
    // This verifies the TypeScript types are correct for count operations
    // We're not executing, just checking compilation

    type CountChain = ReturnType<Repository<TestModel, any>["count"]>;
    type CountWithWhere = ReturnType<CountChain["where"]>;
    type CountChainHasExecute = CountChain extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;
    type CountWithWhereHasExecute = CountWithWhere extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;

    const typeCheck: CountChainHasExecute & CountWithWhereHasExecute = true;

    expect(typeCheck).toBe(true);
  });

  it("type checks: Repository.min() chain", () => {
    type MinChain = ReturnType<Repository<TestModel, any>["min"]>;
    type MinWithWhere = ReturnType<MinChain["where"]>;
    type MinChainHasExecute = MinChain extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;
    type MinWithWhereHasExecute = MinWithWhere extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;

    const typeCheck: MinChainHasExecute & MinWithWhereHasExecute = true;

    expect(typeCheck).toBe(true);
  });

  it("type checks: Repository.max() chain", () => {
    type MaxChain = ReturnType<Repository<TestModel, any>["max"]>;
    type MaxWithWhere = ReturnType<MaxChain["where"]>;
    type MaxChainHasExecute = MaxChain extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;
    type MaxWithWhereHasExecute = MaxWithWhere extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;

    const typeCheck: MaxChainHasExecute & MaxWithWhereHasExecute = true;

    expect(typeCheck).toBe(true);
  });

  it("type checks: Repository.distinct() chain", () => {
    type DistinctChain = ReturnType<Repository<TestModel, any>["distinct"]>;
    type DistinctWithWhere = ReturnType<DistinctChain["where"]>;
    type DistinctChainHasExecute = DistinctChain extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;
    type DistinctWithWhereHasExecute = DistinctWithWhere extends {
      execute: (...args: any[]) => any;
    }
      ? true
      : false;

    const typeCheck: DistinctChainHasExecute &
      DistinctWithWhereHasExecute = true;

    expect(typeCheck).toBe(true);
  });
});
