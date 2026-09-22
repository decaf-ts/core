import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  Condition,
  MethodQueryBuilder,
  Operator,
  Repository,
  table,
  column,
  pk,
} from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";

Adapter.setCurrent("ram");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ramAdapter = new RamAdapter();

@uses("ram")
@table("exists_condition_model")
@model()
class ExistsConditionModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("age")
  age!: number;

  @column("nickname")
  nickname?: string;

  constructor(arg?: any) {
    super(arg);
  }
}

describe("exists query option", () => {
  describe("Condition.attribute(...).exists()", () => {
    it("builds the EXISTS condition shape", () => {
      const condition = Condition.attribute<ExistsConditionModel>("nickname")
        .exists();

      expect(condition).toBeDefined();
      expect(condition.operator).toBe(Operator.EXISTS);
      expect((condition as any).attr1).toBe("nickname");
      expect((condition as any).comparison).toBe(true);
      expect(condition.hasErrors()).toBeUndefined();
    });

    it("serializes to the documented EXISTS shape", () => {
      const condition = Condition.attribute<ExistsConditionModel>("name")
        .exists();

      expect(JSON.parse(JSON.stringify(condition))).toEqual({
        attr1: "name",
        operator: "EXISTS",
        comparison: true,
      });
    });

    it("can be combined with AND and OR", () => {
      const andCondition = Condition.attribute<ExistsConditionModel>("name")
        .exists()
        .and(Condition.attribute<ExistsConditionModel>("age").exists());
      expect(andCondition).toBeDefined();
      expect(andCondition.hasErrors()).toBeUndefined();

      const orCondition = Condition.attribute<ExistsConditionModel>("name")
        .exists()
        .or(Condition.attribute<ExistsConditionModel>("age").exists());
      expect(orCondition).toBeDefined();
      expect(orCondition.hasErrors()).toBeUndefined();
    });
  });

  describe("MethodQueryBuilder existsBy naming convention", () => {
    it("maps existsByName to the exists action and EXISTS where clause", () => {
      const result = MethodQueryBuilder.build("existsByName");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name").exists()
      );
    });

    it("maps existsByNameAndAge to AND-combined EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsByNameAndAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists()
          .and(Condition.attribute("age").exists())
      );
    });

    it("maps existsByNameOrAge to OR-combined EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsByNameOrAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists()
          .or(Condition.attribute("age").exists())
      );
    });

    it("produces the documented QueryAssist shape", () => {
      const result = MethodQueryBuilder.build("existsByName");

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        action: "exists",
        where: { attr1: "name", operator: "EXISTS", comparison: true },
      });
    });
  });

  describe("statement-level exists terminal", () => {
    it("is not exposed on the fluent statement chain", () => {
      const repo = Repository.forModel<
        ExistsConditionModel,
        RamRepository<ExistsConditionModel>
      >(ExistsConditionModel);
      const chain = repo
        .select()
        .where(Condition.attribute<ExistsConditionModel>("nickname").exists());

      expect((chain as any).exists).toBeUndefined();
      expect(typeof (chain as any).exists).not.toBe("function");
    });
  });
});
