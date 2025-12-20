import { Condition, MethodQueryBuilder, OrderDirection } from "../../src";

describe("MethodQueryBuilder", () => {
  describe("Operators", () => {
    it("should handle Equals and In", () => {
      const equals = MethodQueryBuilder.build("findByNameEquals", "Marta");
      expect(equals.where).toEqual(Condition.attribute("name").eq("Marta"));

      const inQuery = MethodQueryBuilder.build("findByCountryIn", ["EN", "US"]);
      expect(inQuery.where).toEqual(
        Condition.attribute("country").in(["EN", "US"])
      );
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
      const trueQuery = MethodQueryBuilder.build("findByActive", true);
      expect(trueQuery.where).toEqual(Condition.attribute("active").eq(true));

      const falseQuery = MethodQueryBuilder.build("findByActive", false);
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
    it("should parse single OrderBy asc", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterOrderByName",
        18,
        OrderDirection.ASC,
        10
      );

      expect(result.orderBy).toEqual([["name", OrderDirection.ASC]]);
    });

    it("should parse single OrderBy dsc", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterOrderByAge",
        18,
        OrderDirection.DSC,
        10
      );

      expect(result.orderBy).toEqual([["age", OrderDirection.DSC]]);
    });

    it("should ignore OrderBy when direction is undefined but clause exists on method", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreaterOrderByName",
        18,
        undefined as any, // no direction
        10
      );
      expect(result.orderBy).toBeUndefined();
    });

    it("should ignore OrderBy when both direction and field are undefined", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeGreater", // no OrderBy
        18,
        undefined as any,
        10
      );

      expect(result.orderBy).toBeUndefined();
    });

    it("should throw for invalid direction when OrderBy exists", () => {
      expect(() =>
        MethodQueryBuilder.build(
          "findByAgeGreaterOrderByName",
          18,
          "UP" as any,
          10
        )
      ).toThrow(/Invalid OrderBy direction UP. Expected one of:/);
    });

    // Now OrderBy currently supports only a single clause
    it.skip("should parse multiple ThenBy orderings", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveOrderByAgeDescThenByCountryDsc",
        true,
        [
          ["age", OrderDirection.DSC],
          ["country", OrderDirection.DSC],
        ],
        5
      );

      expect(result.orderBy).toEqual([
        ["age", OrderDirection.DSC],
        ["country", OrderDirection.DSC],
      ]);
    });

    it("should throw if no OrderBy in method name", () => {
      expect(() =>
        MethodQueryBuilder.build("findByAge", 18, OrderDirection.ASC)
      ).toThrowError(
        /Expected OrderBy clause, but no sortable field was found in method name/
      );
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
        undefined, //orderBy
        10 // limit
      );

      expect(result.limit).toBe(10);
    });

    it("should not set limit if not provided", () => {
      const result = MethodQueryBuilder.build("findByActive", true);
      expect(result.limit).toBeUndefined();
    });
  });

  describe("Offset", () => {
    it("should parse offset as last argument", () => {
      const result = MethodQueryBuilder.build(
        "findByActive",
        true,
        undefined, // orderBy
        10, // limit
        2 // offset
      );

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(2);
    });

    it("should not set limit if not provided", () => {
      const result = MethodQueryBuilder.build("findByActive", true);
      expect(result.limit).toBeUndefined();
      expect(result.offset).toBe(undefined);
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
