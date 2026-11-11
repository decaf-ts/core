import { it } from "@decaf-ts/for-testing";
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

    it("should parse the operator names generated for prepared statements", () => {
      // Statement.prepare() names gt/gte/lt conditions Bigger / BiggerThanEqual / Less
      expect(
        MethodQueryBuilder.build("findByAgeBiggerAndAgeLess", 18, 30).where
      ).toEqual(
        Condition.attribute("age").gt(18).and(Condition.attribute("age").lt(30))
      );
      expect(
        MethodQueryBuilder.build("findByAgeBiggerThanEqual", 18).where
      ).toEqual(Condition.attribute("age").gte(18));
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

    it("should handle two-value Between", () => {
      const result = MethodQueryBuilder.build("findByAgeBetween", 18, 30);

      expect(result.where).toEqual(
        Condition.attribute("age").between(18, 30)
      );
    });

    it("should keep orderBy/limit/offset aligned after a two-value Between", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeBetweenOrderByName",
        18,
        30,
        OrderDirection.ASC,
        5,
        2
      );

      expect(result.where).toEqual(
        Condition.attribute("age").between(18, 30)
      );
      expect(result.orderBy).toEqual([["name", OrderDirection.ASC]]);
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(2);
    });

    it("should compose Between with And", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeBetweenAndActive",
        18,
        30,
        true
      );

      expect(result.where).toEqual(
        Condition.attribute("age")
          .between(18, 30)
          .and(Condition.attribute("active").eq(true))
      );
    });

    it("should compose Between with Or", () => {
      const result = MethodQueryBuilder.build(
        "findByAgeBetweenOrActive",
        18,
        30,
        true
      );

      expect(result.where).toEqual(
        Condition.attribute("age")
          .between(18, 30)
          .or(Condition.attribute("active").eq(true))
      );
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
      expect(() => MethodQueryBuilder.build("findByNameEquals")).toThrow(
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

    it("should parse multiple ThenBy orderings", () => {
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

    it("accepts the params object passed by prepared statements", () => {
      const single = MethodQueryBuilder.build("findByAgeOrderByName", 18, {
        direction: OrderDirection.DSC,
        limit: 5,
        skip: 10,
      });
      expect(single.orderBy).toEqual([["name", OrderDirection.DSC]]);
      expect(single.limit).toBe(5);
      expect(single.offset).toBe(10);

      const multi = MethodQueryBuilder.build(
        "findByAgeOrderByNameThenByCountry",
        18,
        {
          direction: OrderDirection.ASC,
          order: [
            ["name", OrderDirection.ASC],
            ["country", OrderDirection.DSC],
          ],
        }
      );
      expect(multi.orderBy).toEqual([
        ["name", OrderDirection.ASC],
        ["country", OrderDirection.DSC],
      ]);
      // pagination's page number (offset) is not a record offset
      expect(
        MethodQueryBuilder.build("findByAgeOrderByName", 18, {
          direction: OrderDirection.ASC,
          offset: 3,
        }).offset
      ).toBeUndefined();
    });

    it("rejects malformed [field, direction] lists", () => {
      expect(() =>
        MethodQueryBuilder.build("findByActiveOrderByAge", true, [
          ["age", "UP"],
        ])
      ).toThrow(/Invalid OrderBy selector/);
      expect(() =>
        MethodQueryBuilder.build("findByActiveOrderByAge", true, [])
      ).toThrow(/Empty OrderBy list/);
    });

    it("should throw if no OrderBy in method name", () => {
      expect(() =>
        MethodQueryBuilder.build("findByAge", 18, OrderDirection.ASC)
      ).toThrow(
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
      ).toThrow(/Unsupported method/);
    });

    it("should fallback to equals operator", () => {
      const result = MethodQueryBuilder.build("findByNameGt", "John");
      expect(result.where).toEqual(Condition.attribute("nameGt").eq("John"));
    });
  });
});
