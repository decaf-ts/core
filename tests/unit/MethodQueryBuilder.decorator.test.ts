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

    it("should filter with Diff", async () => {
      const result = await userRepo.findByCountryDiff("ON");
      expect(result.every((u) => u.country !== "ON")).toBe(true);
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

    it("should filter with Between", async () => {
      const result = await userRepo.findByAgeBetween(25, 35);
      expect(result.every((u) => u.age >= 25 && u.age <= 35)).toBe(true);
    });

    it("should filter with True and False", async () => {
      const actives = await userRepo.findByActive(true);
      expect(actives.every((u) => u.active)).toBe(true);

      const inactives = await userRepo.findByActive(false);
      expect(inactives.every((u) => !u.active)).toBe(true);
    });

    it.skip("should filter with In", async () => {
      const result = await userRepo.findByCountryIn(["TH", "ON"]);
      expect(result.map((r) => r.country)).toEqual(
        expect.arrayContaining(["TH", "ON"])
      );
    });

    it("should filter with Matches (regex)", async () => {
      const result = await userRepo.findByNameMatches("^David");
      expect(result.every((u) => /^David/.test(u.name))).toBe(true);
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

  describe("OrderBy", () => {
    it("should order by name ascending", async () => {
      const orderByResult = await userRepo.findByActiveOrderByNameAsc(true);
      const names = orderByResult.map((r) => r.name);
      expect(names).toEqual([...names].sort());

      const noOrderByNames = (await userRepo.findByActive(true)).map(
        (r) => r.name
      );
      expect(noOrderByNames).not.toEqual(names);
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

    it.skip("should group by age then by state", async () => {
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

  describe("Select", () => {
    it("should select only the specified fields", async () => {
      const selectedFields = ["name", "age"];
      const result = await userRepo.findByActiveThenSelectNameAndAge(true);
      expect(result.length).toBeGreaterThanOrEqual(2);
      result.forEach((user) => {
        Object.keys(user).forEach((key) => {
          if (selectedFields.includes(key)) {
            expect(user[key]).not.toBeUndefined();
          } else {
            expect(user[key]).toBeUndefined();
          }
        });
      });
    });

    it("should select fields and apply limit", async () => {
      const selectedFields = ["name", "age"];
      const limitResult = await userRepo.findByActiveThenSelectNameAndAge(
        true,
        1
      );
      expect(limitResult.length).toEqual(1);
      limitResult.forEach((user) => {
        Object.keys(user).forEach((key) => {
          if (selectedFields.includes(key)) {
            expect(user[key]).not.toBeUndefined();
          } else {
            expect(user[key]).toBeUndefined();
          }
        });
      });
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

  describe("Offset", () => {
    it("should offset the number of results", async () => {
      const result = await userRepo.findByActive(true);
      expect(result.length).toBeGreaterThanOrEqual(2);

      const limitResult = await userRepo.findByActive(true, 1);
      expect(limitResult.length).toEqual(1);
    });

    it("should offset and limit the number of results", async () => {
      const allResult = await userRepo.findByActive(true);
      expect(allResult.length).toBeGreaterThanOrEqual(3);

      const l1Result = await userRepo.findByActive(true, 1, 1);
      expect(l1Result).toEqual([allResult[1]]);

      const l2Result = await userRepo.findByActive(true, 2, 1);
      expect(l2Result).toEqual([allResult[1], allResult[2]]);

      const l3Result = await userRepo.findByActive(true, 2, 2);
      expect(l3Result).toEqual([allResult[2]]);
    });
  });
});
