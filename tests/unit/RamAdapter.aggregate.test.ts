import { RamAdapter } from "../../src/ram/RamAdapter";
import { Model, model } from "@decaf-ts/decorator-validation";
import { pk } from "../../src";
import { prop } from "@decaf-ts/decoration";

@model()
class TestModel extends Model {
  @pk()
  id!: string;

  @prop()
  name!: string;
  @prop()
  value!: number;

  constructor() {
    super();
  }
}

describe("RamAdapter Aggregate Operations", () => {
  let adapter: RamAdapter;

  beforeAll(() => {
    adapter = new RamAdapter({ user: "test" });
  });

  afterEach(() => {
    const storage = (adapter as any).client as Map<string, Map<string, any>>;
    if (!storage) return;
    const table = Model.tableName(TestModel);
    storage.set(table, new Map());
  });

  describe("MIN operation", () => {
    it("finds minimum value", async () => {
      const { ctx } = (await adapter["logCtx"]([], "create", true)) as any;

      // Create test data
      await adapter.create(TestModel, "1", { name: "test1", value: 10 }, ctx);
      await adapter.create(TestModel, "2", { name: "test2", value: 5 }, ctx);
      await adapter.create(TestModel, "3", { name: "test3", value: 20 }, ctx);

      const min = await adapter.raw(
        {
          from: TestModel,
          where: () => true,
          select: undefined,
          min: "value" as any,
        },
        true,
        ctx
      );

      expect(min).toBe(5);
    });

    it("handles minimum with where condition", async () => {
      const { ctx } = (await adapter["logCtx"]([], "create", true)) as any;

      await adapter.create(TestModel, "1", { name: "test1", value: 10 }, ctx);
      await adapter.create(TestModel, "2", { name: "test2", value: 5 }, ctx);
      await adapter.create(TestModel, "3", { name: "test3", value: 20 }, ctx);

      const min = await adapter.raw(
        {
          from: TestModel,
          where: (m: any) => m.value > 7,
          select: undefined,
          min: "value" as any,
        },
        true,
        ctx
      );

      expect(min).toBe(10);
    });
  });

  describe("MAX operation", () => {
    it("finds maximum value", async () => {
      const { ctx } = (await adapter["logCtx"]([], "create", true)) as any;

      await adapter.create(TestModel, "1", { name: "test1", value: 10 }, ctx);
      await adapter.create(TestModel, "2", { name: "test2", value: 5 }, ctx);
      await adapter.create(TestModel, "3", { name: "test3", value: 20 }, ctx);

      const max = await adapter.raw(
        {
          from: TestModel,
          where: () => true,
          select: undefined,
          max: "value" as any,
        },
        true,
        ctx
      );

      expect(max).toBe(20);
    });
  });

  describe("COUNT operation", () => {
    it("counts all records", async () => {
      const { ctx } = (await adapter["logCtx"]([], "create", true)) as any;

      await adapter.create(TestModel, "1", { name: "test1", value: 10 }, ctx);
      await adapter.create(TestModel, "2", { name: "test2", value: 5 }, ctx);
      await adapter.create(TestModel, "3", { name: "test3", value: 20 }, ctx);

      const count = await adapter.raw(
        {
          from: TestModel,
          where: () => true,
          select: undefined,
          count: undefined as any,
        },
        true,
        ctx
      );

      expect(count).toBe(3);
    });
  });

  describe("DISTINCT operation", () => {
    it("finds distinct values", async () => {
      const { ctx } = (await adapter["logCtx"]([], "create", true)) as any;

      await adapter.create(TestModel, "1", { name: "test1", value: 10 }, ctx);
      await adapter.create(TestModel, "2", { name: "test2", value: 5 }, ctx);
      await adapter.create(TestModel, "3", { name: "test3", value: 10 }, ctx);

      const distinct = await adapter.raw(
        {
          from: TestModel,
          where: () => true,
          select: undefined,
          distinct: "value" as any,
        },
        true,
        ctx
      );

      expect(Array.isArray(distinct)).toBe(true);
      expect((distinct as any[]).slice().sort((a, b) => a - b)).toEqual([
        5, 10,
      ]);
    });
  });
});
