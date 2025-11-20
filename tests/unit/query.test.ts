import { RamAdapter } from "../../src/ram/RamAdapter";

const adapter = new RamAdapter();

import {
  min,
  minlength,
  model,
  required,
  type,
} from "@decaf-ts/decorator-validation";
import type { ModelArg } from "@decaf-ts/decorator-validation";
import { readonly } from "@decaf-ts/db-decorators";
import {
  BaseModel,
  index,
  OrderDirection,
  pk,
  Repository,
  Condition,
} from "../../src/index";
import { RamRepository } from "../../src/ram/types";
import { uses } from "@decaf-ts/decoration";

jest.setTimeout(50000);

describe("Queries", () => {
  @uses("ram")
  @model()
  class TestUser extends BaseModel {
    @pk({ type: "Number" })
    id!: number;

    @required()
    @min(18)
    @index([OrderDirection.DSC, OrderDirection.ASC])
    age!: number;

    @required()
    @minlength(5)
    name!: string;

    @required()
    @readonly()
    @type([String])
    sex!: "M" | "F";

    constructor(arg?: ModelArg<TestUser>) {
      super(arg);
    }
  }

  let created: TestUser[];

  it("Creates in bulk", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const models = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(
      (i) =>
        new TestUser({
          age: Math.floor(18 + (i - 1) / 3),
          name: "user_name_" + i,
          sex: i % 2 === 0 ? "M" : "F",
        })
    );
    created = await repo.createAll(models);
    expect(created).toBeDefined();
    expect(Array.isArray(created)).toEqual(true);
    expect(created.every((el) => el instanceof TestUser)).toEqual(true);
    expect(created.every((el) => !el.hasErrors())).toEqual(true);
  });

  it("Performs simple queries - full object", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const selected = await repo.select().execute();
    expect(
      created.every((c) => c.equals(selected.find((s: any) => (s.id = c.id))))
    );
  });

  it("Performs simple queries - attributes only", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const selected = await repo.select(["age", "sex"]).execute();
    expect(selected).toEqual(
      expect.arrayContaining(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [...new Array(created.length)].map((e) =>
          expect.objectContaining({
            age: expect.any(Number),
            sex: expect.stringMatching(/^M|F$/g),
          })
        )
      )
    );
  });

  it("Performs conditional queries - full object", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute<TestUser>("age").eq(20);
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(created.filter((c) => c.age === 20).length);
  });

  it("Performs conditional queries - selected attributes", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute<TestUser>("age").eq(20);
    const selected = await repo
      .select(["age", "sex"])
      .where(condition)
      .execute();
    expect(selected.length).toEqual(created.filter((c) => c.age === 20).length);
    expect(selected).toEqual(
      expect.arrayContaining(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        [...new Array(created.length)].map((e: any) =>
          expect.objectContaining({
            age: expect.any(Number),
            sex: expect.stringMatching(/^M|F$/g),
          })
        )
      )
    );
  });

  it("Performs AND conditional queries - full object", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const condition = Condition.attribute<TestUser>("age")
      .eq(20)
      .and(Condition.attribute<TestUser>("sex").eq("M"));
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 && c.sex === "M").length
    );
  });

  it("Performs OR conditional queries - full object", async () => {
    const repo = Repository.forModel<TestUser, RamRepository<TestUser>>(
      TestUser
    );
    const condition = Condition.attribute<TestUser>("age")
      .eq(20)
      .or(Condition.attribute<TestUser>("age").eq(19));
    const selected = await repo.select().where(condition).execute();
    expect(selected.length).toEqual(
      created.filter((c) => c.age === 20 || c.age === 19).length
    );
  });

  it("Sorts strings", async () => {
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const results = await repo
      .select()
      .orderBy(["name", OrderDirection.DSC])
      .execute();
    expect(results.map((r) => r.name.split("_")[2] as string)).toEqual(
      [9, 8, 7, 6, 5, 4, 3, 2, 10, 1].map((r) => "" + r)
    );
  });

  it("Sorts numbers", async () => {
    await adapter.initialize();
    const repo: RamRepository<TestUser> = Repository.forModel<
      TestUser,
      RamRepository<TestUser>
    >(TestUser);
    const sorted = await repo
      .select()
      .orderBy(["age", OrderDirection.DSC])
      .execute();
    expect(sorted).toBeDefined();
    expect(sorted.length).toEqual(created.length);
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) continue;

      expect(sorted[i - 1].age).toBeGreaterThanOrEqual(sorted[i].age);
    }
  });
});
