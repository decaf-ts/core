import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  Condition,
  MethodQueryBuilder,
  QueryError,
  Repository,
  UnsupportedError,
  column,
  pk,
  query,
  table,
} from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";

Adapter.setCurrent("ram");

const ramAdapter = new RamAdapter();

@uses("ram")
@table("exists_naming_model")
@model()
class ExistsNamingModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("age")
  age!: number;

  @column("tenantId")
  tenantId!: string;

  @column("nickname")
  nickname?: string;

  constructor(arg?: any) {
    super(arg);
  }
}

class ExistsNamingRepository extends Repository<
  ExistsNamingModel,
  RamAdapter
> {
  constructor(adapter: RamAdapter) {
    // `existsStatement()` registers a default repository for the model, so force
    // the custom (query-decorated) repository over that registration.
    super(adapter, ExistsNamingModel, true);
  }

  @query()
   
  async existsByName(): Promise<boolean> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }

  @query()
   
  async existsByTenantId(): Promise<boolean> {
    throw new UnsupportedError(`Method overridden by @query decorator.`);
  }
}

const existsNamingRepo = new ExistsNamingRepository(ramAdapter);

function existsStatement() {
  const repo = Repository.forModel<
    ExistsNamingModel,
    RamRepository<ExistsNamingModel>
  >(ExistsNamingModel);
  return repo
    .select()
    .where(Condition.attribute<ExistsNamingModel>("nickname").exists());
}

describe("exists query option — naming and prepared-path regressions", () => {
  describe("Scenario A — existsBy<Field><ComparisonOperatorSuffix> must not drop the filter", () => {
    it("throws QueryError for existsByTenantIdEquals with a value", () => {
      expect(() =>
        MethodQueryBuilder.build("existsByTenantIdEquals", "ACME")
      ).toThrow(QueryError);
    });

    it("throws QueryError for existsByAgeBiggerThan with a value", () => {
      expect(() =>
        MethodQueryBuilder.build("existsByAgeBiggerThan", 21)
      ).toThrow(QueryError);
    });

    it("keeps existsByName parsing to a plain EXISTS condition", () => {
      const result = MethodQueryBuilder.build("existsByName");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(Condition.attribute("name").exists());
    });

    it("keeps existsByNameAndAge parsing to AND-combined EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsByNameAndAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists()
          .and(Condition.attribute("age").exists())
      );
    });

    it("keeps existsByNameOrAge parsing to OR-combined EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsByNameOrAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists()
          .or(Condition.attribute("age").exists())
      );
    });

    it("keeps findByNameExists parsing to a find with an EXISTS condition", () => {
      const result = MethodQueryBuilder.build("findByNameExists");

      expect(result.action).toBe("find");
      expect(result.where).toEqual(Condition.attribute("name").exists());
    });

    it("resolves existsNotByName to a single negated EXISTS condition", () => {
      const result = MethodQueryBuilder.build("existsNotByName");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(Condition.attribute("name").exists(false));
    });

    it("resolves existsNotByNameAndAge to AND-combined negated EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsNotByNameAndAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists(false)
          .and(Condition.attribute("age").exists(false))
      );
    });

    it("resolves existsNotByNameOrAge to OR-combined negated EXISTS conditions", () => {
      const result = MethodQueryBuilder.build("existsNotByNameOrAge");

      expect(result.action).toBe("exists");
      expect(result.where).toEqual(
        Condition.attribute("name")
          .exists(false)
          .or(Condition.attribute("age").exists(false))
      );
    });
  });

  describe("Scenario B — statement-level exists terminal must not exist", () => {
    it("exposes no exists terminal on the statement chain", () => {
      const chain = existsStatement();
      expect((chain as any).exists).toBeUndefined();
      expect(typeof (chain as any).exists).not.toBe("function");
    });

    it("does not reject when prepare() squashes a simple EXISTS query to the list prepared form", async () => {
      const stmt = existsStatement();
      await expect(stmt.prepare()).resolves.toBeDefined();
      expect((stmt as any).prepared).toMatchObject({
        method: "listByExists",
        args: ["nickname"],
      });
    });

    it("still squashes a simple EXISTS query to listByExists when forcePrepareSimpleQueries is set", async () => {
      const repo = Repository.forModel<
        ExistsNamingModel,
        RamRepository<ExistsNamingModel>
      >(ExistsNamingModel);
      const stmt = repo
        .override({ forcePrepareSimpleQueries: true })
        .select()
        .where(Condition.attribute<ExistsNamingModel>("nickname").exists());

      await stmt.prepare();

      expect((stmt as any).prepared).toMatchObject({
        method: "listByExists",
        args: ["nickname"],
      });
    });
  });

  describe("Scenario C — existsBy<Field> naming resolves to a boolean", () => {
    let repo: ExistsNamingRepository;

    beforeAll(async () => {
      repo = existsNamingRepo;
      await repo.createAll([
        new ExistsNamingModel({
          id: "1",
          name: "alice",
          age: 30,
          tenantId: "ACME",
          nickname: "ali",
        }),
        new ExistsNamingModel({
          id: "2",
          name: "bob",
          age: 40,
          tenantId: "ACME",
        }),
      ]);
    });

    it("resolves existsByName() to true when the field is present", async () => {
      await expect(repo.existsByName()).resolves.toBe(true);
    });

    it("resolves existsByTenantId() to true when the field is present", async () => {
      await expect(repo.existsByTenantId()).resolves.toBe(true);
    });
  });
});
