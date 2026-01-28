import { Condition, MethodQueryBuilder, OrderDirection } from "../../src";

describe("MethodQueryBuilder - New Prefixes", () => {
  describe("countBy prefix", () => {
    it("should parse countByField", () => {
      const result = MethodQueryBuilder.build("countByAge");
      expect(result.action).toBe("count");
      expect(result.selector).toBe("age");
      expect(result.where).toBeUndefined();
    });

    it("should parse countByFieldAndCondition", () => {
      const result = MethodQueryBuilder.build(
        "countByAgeAndNameEquals",
        "John"
      );
      expect(result.action).toBe("count");
      expect(result.selector).toBe("age");
      // The condition should be on "name" since "AndName" is the condition part
      expect(result.where).toEqual(Condition.attribute("name").eq("John"));
    });
  });

  describe("sumBy prefix", () => {
    it("should parse sumByField", () => {
      const result = MethodQueryBuilder.build("sumByPrice");
      expect(result.action).toBe("sum");
      expect(result.selector).toBe("price");
      expect(result.where).toBeUndefined();
    });

    it("should parse sumByFieldGroupByAnother", () => {
      const result = MethodQueryBuilder.build("sumByPriceGroupByCategory");
      expect(result.action).toBe("sum");
      expect(result.selector).toBe("price");
      expect(result.groupBy).toEqual(["category"]);
    });
  });

  describe("avgBy prefix", () => {
    it("should parse avgByField", () => {
      const result = MethodQueryBuilder.build("avgByScore");
      expect(result.action).toBe("avg");
      expect(result.selector).toBe("score");
      expect(result.where).toBeUndefined();
    });
  });

  describe("minBy prefix", () => {
    it("should parse minByField", () => {
      const result = MethodQueryBuilder.build("minByCreatedAt");
      expect(result.action).toBe("min");
      expect(result.selector).toBe("createdAt");
      expect(result.where).toBeUndefined();
    });
  });

  describe("maxBy prefix", () => {
    it("should parse maxByField", () => {
      const result = MethodQueryBuilder.build("maxByUpdatedAt");
      expect(result.action).toBe("max");
      expect(result.selector).toBe("updatedAt");
      expect(result.where).toBeUndefined();
    });
  });

  describe("distinctBy prefix", () => {
    it("should parse distinctByField", () => {
      const result = MethodQueryBuilder.build("distinctByCountry");
      expect(result.action).toBe("distinct");
      expect(result.selector).toBe("country");
      expect(result.where).toBeUndefined();
    });
  });

  describe("groupBy prefix", () => {
    it("should parse groupByField", () => {
      const result = MethodQueryBuilder.build("groupByCategory");
      expect(result.action).toBe("group");
      expect(result.selector).toBe("category");
      expect(result.where).toBeUndefined();
    });

    it("should parse groupByFieldThenByAnother", () => {
      const result = MethodQueryBuilder.build("groupByCategoryThenByRegion");
      expect(result.action).toBe("group");
      expect(result.selector).toBe("category");
      // The ThenBy should be captured in groupBy array
      expect(result.groupBy).toEqual(["region"]);
    });
  });

  describe("pageBy prefix", () => {
    it("should parse pageByField", () => {
      const result = MethodQueryBuilder.build(
        "pageByNameOrderByAge",
        "John",
        OrderDirection.ASC,
        10
      );
      expect(result.action).toBe("page");
      expect(result.where).toEqual(Condition.attribute("name").eq("John"));
      expect(result.orderBy).toEqual([["age", OrderDirection.ASC]]);
    });

    it("should parse pageBy without conditions", () => {
      const result = MethodQueryBuilder.build(
        "pageByOrderByCreatedAt",
        OrderDirection.DSC,
        20
      );
      expect(result.action).toBe("page");
      // No where clause because the method name doesn't have conditions
    });
  });

  describe("findBy with GroupBy clause", () => {
    it("should parse findByConditionGroupByField", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveGroupByCountry",
        true
      );
      expect(result.action).toBe("find");
      expect(result.where).toEqual(Condition.attribute("active").eq(true));
      expect(result.groupBy).toEqual(["country"]);
    });

    it("should parse findByConditionGroupByFieldThenByAnother", () => {
      const result = MethodQueryBuilder.build(
        "findByActiveGroupByCountryThenByCity",
        true
      );
      expect(result.action).toBe("find");
      expect(result.where).toEqual(Condition.attribute("active").eq(true));
      expect(result.groupBy).toEqual(["country", "city"]);
    });
  });

  describe("getFieldsFromMethodName", () => {
    it("should return fields for findBy", () => {
      const fields = MethodQueryBuilder.getFieldsFromMethodName(
        "findByNameAndAgeGreaterThan"
      );
      expect(fields).toEqual(["name", "ageGreaterThan"]);
    });

    it("should return empty array for aggregation without conditions", () => {
      const fields = MethodQueryBuilder.getFieldsFromMethodName("countByAge");
      expect(fields).toEqual([]);
    });

    it("should return fields for pageBy with conditions", () => {
      const fields = MethodQueryBuilder.getFieldsFromMethodName(
        "pageByNameEquals"
      );
      expect(fields).toEqual(["nameEquals"]);
    });
  });

  describe("Error handling", () => {
    it("should throw for unsupported prefix", () => {
      expect(() => MethodQueryBuilder.build("searchByName", "John")).toThrow(
        /Unsupported method/
      );
    });
  });
});
