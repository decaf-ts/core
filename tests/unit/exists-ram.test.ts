import { model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  Condition,
  UnsupportedError,
  column,
  pk,
  Repository,
  table,
} from "../../src";
import { Adapter } from "../../src/persistence/Adapter";
import { RamAdapter } from "../../src/ram/RamAdapter";
import { RamRepository } from "../../src/ram/types";

Adapter.setCurrent("ram");

@uses("ram")
@table("exists_ram_model")
@model()
class ExistsRamModel extends BaseModel {
  @pk()
  id!: string;

  @column("name")
  name!: string;

  @column("nickname")
  nickname?: string;

  @column("alias")
  alias?: string;

  constructor(arg?: any) {
    super(arg);
  }
}

describe("exists against the RAM adapter", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adapter: RamAdapter;
  let repo: RamRepository<ExistsRamModel>;

  beforeAll(async () => {
    adapter = new RamAdapter();
    repo = Repository.forModel<ExistsRamModel, RamRepository<ExistsRamModel>>(
      ExistsRamModel
    );
    await repo.createAll([
      new ExistsRamModel({ id: "1", name: "alice", nickname: "ali" }),
      new ExistsRamModel({ id: "2", name: "bob", nickname: "bobby" }),
      new ExistsRamModel({ id: "3", name: "carol" }),
    ]);
  });

  it("Repository.existsOf returns true when the field is present on some record", async () => {
    await expect(repo.existsOf("nickname")).resolves.toBe(true);
  });

  it("Repository.existsOf returns false when the field is absent on every record", async () => {
    await expect(repo.existsOf("alias")).resolves.toBe(false);
  });

  it("does not expose a statement-level exists terminal on the query chain", () => {
    const chain = repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists());
    expect((chain as any).exists).toBeUndefined();
    expect(typeof (chain as any).exists).not.toBe("function");
  });

  it("does not type-check a statement-level .exists() call", () => {
    const chain = repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists());
    // @ts-expect-error the statement-level exists terminal was removed
    const call = () => chain.exists();
    expect(call).toBeDefined();
  });

  it("delivers condition-level EXISTS through .execute() when records match", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists())
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect((results as ExistsRamModel[]).length).toBeGreaterThan(0);
  });

  it("delivers condition-level EXISTS through .execute() when no record matches", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("alias").exists())
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect((results as ExistsRamModel[]).length).toBe(0);
  });

  it("delivers condition-level EXISTS through .paginate()", async () => {
    const paginator = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists())
      .paginate(2);

    const page = await paginator.page();
    expect(Array.isArray(page)).toBe(true);
    expect(page.length).toBeGreaterThan(0);
  });

  it("squashes EXISTS to existsOf and resolves true through the standard execute path", async () => {
    const stmt = repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists());

    await stmt.prepare();

    expect((stmt as any).prepared).toMatchObject({
      method: "existsOf",
      args: ["nickname"],
    });
    await expect(stmt.execute()).resolves.toBe(true);
  });

  it("squashes EXISTS to existsOf and resolves false through the standard execute path", async () => {
    const stmt = repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsRamModel>("alias").exists());

    await stmt.prepare();

    expect((stmt as any).prepared).toMatchObject({
      method: "existsOf",
      args: ["alias"],
    });
    await expect(stmt.execute()).resolves.toBe(false);
  });

  it("delivers negated condition-level EXISTS through .execute()", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists(false))
      .execute();

    expect(Array.isArray(results)).toBe(true);
    expect(
      (results as ExistsRamModel[]).map((r) => r.id).sort()
    ).toEqual(["3"]);
  });

  it("delivers negated condition-level EXISTS for an always-absent attribute", async () => {
    const results = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("alias").exists(false))
      .execute();

    expect(
      (results as ExistsRamModel[]).map((r) => r.id).sort()
    ).toEqual(["1", "2", "3"]);
  });

  it("delivers negated condition-level EXISTS through .paginate()", async () => {
    const paginator = await repo
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists(false))
      .paginate(2);

    const page = await paginator.page();
    expect(Array.isArray(page)).toBe(true);
    expect(page.map((r) => r.id).sort()).toEqual(["3"]);
  });

  it("classifies exists(false) as a simple query but does not squash it to existsOf", async () => {
    const stmt = repo
      .override({ forcePrepareSimpleQueries: true })
      .select()
      .where(Condition.attribute<ExistsRamModel>("nickname").exists(false));

    expect((stmt as any).isSimpleQuery()).toBe(true);
    await expect(stmt.prepare()).rejects.toThrow(UnsupportedError);
  });
});
