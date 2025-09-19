import { Condition, MethodQueryBuilder, OrderDirection } from "../../src";

describe("MethodQueryBuilder", () => {
  describe("Operators", () => {
    it("should handle Equals and Is", () => {
      const equals = MethodQueryBuilder.build("findByNameEquals", "Marta");
      const is = MethodQueryBuilder.build("findByActiveIs", true);

      expect(equals.where).toEqual(Condition.attribute("name").eq("Marta"));
      expect(is.where).toEqual(Condition.attribute("active").eq(true));
    });

    it("should handle GreaterThan and LessThan together", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterThanAndAgeLessThan",
        18,
        30
      );

      const expected = Condition.attribute("age")
        .gt(18)
        .and(Condition.attribute("age").lt(30));

      expect(result.where).toEqual(expected);
    });

    it("should handle GreaterThanEqual and LessThanEqual", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterThanEqualAndAgeLessThanEqual",
        18,
        30
      );

      const expected = Condition.attribute("age")
        .gte(18)
        .and(Condition.attribute("age").lte(30));

      expect(result.where).toEqual(expected);
    });

    it("should handle True and False", () => {
      const trueQuery = MethodQueryBuilder.build("findByActiveTrue", true);
      const falseQuery = MethodQueryBuilder.build("findByActiveFalse", false);

      expect(trueQuery.where).toEqual(Condition.attribute("active").eq(true));
      expect(falseQuery.where).toEqual(Condition.attribute("active").eq(false));
    });

    it("should handle In operator", () => {
      const result = MethodQueryBuilder.build("findByCountryIn", ["BR", "US"]);
      expect(result.where).toEqual(
        Condition.attribute("country").in(["BR", "US"])
      );
    });

    it("should handle Or conditions", () => {
      const result = MethodQueryBuilder.build(
        "findByNameEqualsOrAgeGreaterThan",
        "Pedro",
        18
      );

      const expected = Condition.attribute("name")
        .eq("Pedro")
        .or(Condition.attribute("age").gt(18));

      expect(result.where).toEqual(expected);
    });

    it("should throw error if missing value", () => {
      expect(() => MethodQueryBuilder.build("findByNameEquals")).toThrowError(
        /Invalid value for field name/
      );
    });
  });

  describe("OrderBy", () => {
    it("should parse single OrderBy", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterThanOrderByNameAsc",
        18
      );

      expect(result.orderBy).toEqual([["name", OrderDirection.ASC]]);
    });

    it("should parse multiple ThenBy orderings", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveOrderByAgeDescThenByCountryDsc",
        true
      );

      expect(result.orderBy).toEqual([
        ["age", OrderDirection.DSC],
        ["country", OrderDirection.DSC],
      ]);
    });

    it("should throw error on invalid OrderBy part", () => {
      expect(() =>
        MethodQueryBuilder.build("findByAgeOrderByInvalid", 18)
      ).toThrowError(/Invalid OrderBy part/);
    });
  });

  describe("GroupBy", () => {
    it("should parse simple GroupBy", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveGroupByCountry",
        true
      );

      expect(result.groupBy).toEqual(["country"]);
    });

    it("should parse multiple GroupBy with ThenBy", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveGroupByAgeThenByState",
        true
      );

      expect(result.groupBy).toEqual(["age", "state"]);
    });
  });

  describe("Limit", () => {
    it("should parse limit as last argument", () => {
      const result = MethodQueryBuilder.build(
        "findByActive",
        true,
        10 // limit
      );

      expect(result.limit).toBe(10);
    });

    it("should not set limit if not provided", () => {
      const result = MethodQueryBuilder.build("findByActive", true);
      expect(result.limit).toBeUndefined();
    });
  });

  describe("Edge Cases", () => {
    it("should throw if method does not start with findBy", () => {
      expect(() =>
        MethodQueryBuilder.build("searchByNameEquals", "John")
      ).toThrowError(/Unsupported method/);
    });

    it("should fallback to equals operator", () => {
      const result = MethodQueryBuilder.build("findByNameGt", "John");
      expect(result.where).toEqual(Condition.attribute("nameGt").eq("John"));
    });
  });
});
