import { Condition } from "../../src/query/Condition";
import { Operator } from "../../src/query/constants";
import { Model } from "@decaf-ts/decorator-validation";

// Simple test model
class TestModel extends Model {
  id!: string;
  name!: string;
  age!: number;
  score!: number;
  createdAt!: Date;
}

describe("Condition", () => {
  describe("BETWEEN operator", () => {
    it("creates a valid BETWEEN condition", () => {
      const condition = Condition.attr<TestModel>("age").between(18, 65);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("validates BETWEEN requires array with 2 values", () => {
      // Manually construct an invalid BETWEEN condition to test validation
      const condition = new (Condition as any)("age", Operator.BETWEEN, [10]);
      const errors = condition.hasErrors();
      expect(errors).toBeDefined();
      expect(errors?.comparison?.condition).toContain(
        "BETWEEN operator requires an array with exactly 2 values"
      );
    });

    it("validates BETWEEN with too many values", () => {
      const condition = new (Condition as any)("age", Operator.BETWEEN, [
        10, 20, 30,
      ]);
      const errors = condition.hasErrors();
      expect(errors).toBeDefined();
      expect(errors?.comparison?.condition).toContain(
        "BETWEEN operator requires an array with exactly 2 values"
      );
    });

    it("validates BETWEEN with non-array value", () => {
      const condition = new (Condition as any)("age", Operator.BETWEEN, 10);
      const errors = condition.hasErrors();
      expect(errors).toBeDefined();
      expect(errors?.comparison?.condition).toContain(
        "BETWEEN operator requires an array with exactly 2 values"
      );
    });

    it("can be combined with AND", () => {
      const condition1 = Condition.attr<TestModel>("age").between(18, 65);
      const condition2 = Condition.attr<TestModel>("score").gt(50);
      const combined = condition1.and(condition2);

      expect(combined).toBeDefined();
      expect(combined.hasErrors()).toBeUndefined();
    });

    it("can be combined with OR", () => {
      const condition1 = Condition.attr<TestModel>("age").between(18, 25);
      const condition2 = Condition.attr<TestModel>("age").between(55, 65);
      const combined = condition1.or(condition2);

      expect(combined).toBeDefined();
      expect(combined.hasErrors()).toBeUndefined();
    });
  });

  describe("IN operator", () => {
    it("creates a valid IN condition", () => {
      const condition = Condition.attr<TestModel>("age").in([18, 25, 30, 40]);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("handles IN with empty array", () => {
      const condition = Condition.attr<TestModel>("age").in([]);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("handles IN with single value", () => {
      const condition = Condition.attr<TestModel>("age").in([25]);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("can be combined with AND", () => {
      const condition1 = Condition.attr<TestModel>("age").in([18, 25, 30]);
      const condition2 = Condition.attr<TestModel>("score").gt(50);
      const combined = condition1.and(condition2);

      expect(combined).toBeDefined();
      expect(combined.hasErrors()).toBeUndefined();
    });
  });

  describe("Other operators", () => {
    it("creates EQUAL condition", () => {
      const condition = Condition.attr<TestModel>("name").eq("John");
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates GREATER THAN condition", () => {
      const condition = Condition.attr<TestModel>("age").gt(18);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates LESS THAN condition", () => {
      const condition = Condition.attr<TestModel>("age").lt(65);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates GREATER THAN OR EQUAL condition", () => {
      const condition = Condition.attr<TestModel>("age").gte(18);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates LESS THAN OR EQUAL condition", () => {
      const condition = Condition.attr<TestModel>("age").lte(65);
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates DIFFERENT condition", () => {
      const condition = Condition.attr<TestModel>("name").dif("John");
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates REGEXP condition", () => {
      const condition = Condition.attr<TestModel>("name").regexp("^John");
      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });
  });

  describe("Complex conditions", () => {
    it("combines multiple conditions with AND", () => {
      const condition = Condition.attr<TestModel>("age")
        .gt(18)
        .and(Condition.attr<TestModel>("age").lt(65))
        .and(Condition.attr<TestModel>("score").gte(50));

      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("combines multiple conditions with OR", () => {
      const condition = Condition.attr<TestModel>("age")
        .between(18, 25)
        .or(Condition.attr<TestModel>("age").between(55, 65));

      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("combines AND and OR", () => {
      const youngOrOld = Condition.attr<TestModel>("age")
        .lt(25)
        .or(Condition.attr<TestModel>("age").gt(55));
      const highScore = Condition.attr<TestModel>("score").gte(80);
      const condition = youngOrOld.and(highScore);

      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });
  });

  describe("Builder pattern", () => {
    it("creates condition using builder", () => {
      const condition = Condition.builder<TestModel>()
        .attr("age")
        .between(18, 65);

      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("creates condition using attribute shorthand", () => {
      const condition = Condition.attribute<TestModel>("age").gt(18);

      expect(condition).toBeDefined();
      expect(condition.hasErrors()).toBeUndefined();
    });
  });
});
