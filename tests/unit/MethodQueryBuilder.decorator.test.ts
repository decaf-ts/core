import { Model } from "@decaf-ts/decorator-validation";
import { MethodQueryBuilderRepo } from "./MethodQueryBuilderRepo";
// import { RamAdapter } from "../../src/ram/RamAdapter";
// const ramAdapter = new RamAdapter();

Model.setBuilder(Model.fromModel);

describe("MethodQueryBuilder Decorator", () => {
  const userRepo = new MethodQueryBuilderRepo();

  beforeAll(async () => {
    await userRepo.init();
  });

  describe("Operators", () => {
    it("should filter with Equals", async () => {
      const result = await userRepo.findByName("John Smith");
      expect(result.map((r) => r.name)).toEqual(["John Smith"]);
    });

    it("should filter with GreaterThan and LessThan", async () => {
      const result = await userRepo.findByAgeGreaterThanAndAgeLessThan(21, 25);
      expect(result.every((u) => u.age > 21 && u.age < 25)).toBe(true);
    });

    it("should filter with GreaterThanEqual and LessThanEqual", async () => {
      const result =
        await userRepo.findByAgeGreaterThanEqualAndAgeLessThanEqual(22, 24);
      expect(result.every((u) => u.age >= 22 && u.age <= 24)).toBe(true);
    });

    it("should filter with True and False", async () => {
      const actives = await userRepo.findByActiveTrue();
      expect(actives.every((u) => u.active)).toBe(true);

      const inactives = await userRepo.findByActiveFalse();
      expect(inactives.every((u) => !u.active)).toBe(true);
    });

    it("should filter with In", async () => {
      const result = await userRepo.findByCountryIn(["TH", "ON"]);
      expect(result.map((r) => r.country)).toEqual(
        expect.arrayContaining(["TH", "ON"])
      );
    });

    it("should filter with Or", async () => {
      const result = await userRepo.findByNameEqualsOrAgeGreaterThan(
        "John Smith",
        27
      );
      expect(result.some((u) => u.name === "John Smith")).toBe(true);
      expect(result.some((u) => u.age > 27)).toBe(true);
    });
  });

  describe.skip("OrderBy", () => {
    it("should order by name ascending", async () => {
      const result = []; // await userRepo.findByActiveOrderByNameAsc(true);
      const names = result.map((r) => r.name);
      expect(names).toEqual([...names].sort());
    });

    it("should order by age desc then by country dsc", async () => {
      const result = []; // await userRepo.findByActiveOrderByAgeDescThenByCountryDsc(true);
      const ages = result.map((r) => r.age);
      expect(ages).toEqual([...ages].sort((a, b) => b - a));
    });
  });

  describe.skip("GroupBy", () => {
    it("should group by state", async () => {
      const result = []; // await userRepo.findByActiveGroupByState(true);
      const groups = result.map((g) => g.group);
      expect(groups).toEqual(expect.arrayContaining(data.map((d) => d.state)));
    });

    it("should group by age then by state", async () => {
      const result = [];
      // await userRepo.findByAgeGreaterThanAndActiveGroupByAgeThenByStateOrderByAgeDescThenByCountryDsc(
      //   21,
      //   true,
      //   10
      // );
      expect(
        result.every((g) => g.items.every((i) => i.age > 21 && i.active))
      ).toBe(true);
    });
  });

  describe("Limit", () => {
    it("should limit the number of results", async () => {
      const result = await userRepo.findByActive(true);
      expect(result.length).toBeGreaterThanOrEqual(2);

      const limitResult = await userRepo.findByActive(true, 1);
      expect(limitResult.length).toEqual(1);
    });
  });
});
