import { Adapter, createdBy, pk, Repository } from "../../src";
import { RamAdapter } from "../../src/ram";
import { uses } from "@decaf-ts/decoration";
import { Model, model, type ModelArg } from "@decaf-ts/decorator-validation";

describe("adapter alias/flavour model ownership and handler fallback", () => {
  const secondAlias = "second";
  let primaryAdapter: RamAdapter;
  let secondAdapter: RamAdapter;

  beforeAll(() => {
    try {
      primaryAdapter = Adapter.get("ram") as RamAdapter;
    } catch {
      primaryAdapter = new RamAdapter();
    }
    Adapter.unregister(secondAlias);
    secondAdapter = new RamAdapter(undefined, secondAlias);
  });

  afterAll(async () => {
    await secondAdapter.shutdown();
    Adapter.unregister(secondAlias);
  });

  @model()
  class PrimaryRamModel extends Model {
    @pk({ type: Number, generated: true })
    id!: number;

    @createdBy()
    createdBy!: string;

    constructor(arg?: ModelArg<PrimaryRamModel>) {
      super(arg);
    }
  }
  uses("ram")(PrimaryRamModel);

  @model()
  class SecondaryRamModel extends Model {
    @pk({ type: Number, generated: true })
    id!: number;

    @createdBy()
    createdBy!: string;

    constructor(arg?: ModelArg<SecondaryRamModel>) {
      super(arg);
    }
  }
  uses(secondAlias)(SecondaryRamModel);

  it("keeps model ownership alias-specific while handlers resolve by adapter flavour", async () => {
    const ramModels = Adapter.models("ram");
    const secondModels = Adapter.models(secondAlias);

    expect(ramModels).toContain(PrimaryRamModel as any);
    expect(ramModels).not.toContain(SecondaryRamModel as any);
    expect(secondModels).toContain(SecondaryRamModel as any);
    expect(secondModels).not.toContain(PrimaryRamModel as any);

    const primaryRepo = Repository.forModel(PrimaryRamModel, primaryAdapter.alias);
    const secondaryRepo = Repository.forModel(SecondaryRamModel);

    expect((primaryRepo as any).adapter.alias).toBe("ram");
    expect((secondaryRepo as any).adapter.alias).toBe(secondAlias);

    const primaryCreated = await primaryRepo.create(new PrimaryRamModel({}));
    const secondaryCreated = await secondaryRepo.create(new SecondaryRamModel({}));

    expect(primaryCreated.createdBy).toEqual(expect.any(String));
    expect(secondaryCreated.createdBy).toEqual(expect.any(String));
  });
});
