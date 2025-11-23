import { RamAdapter, RamFlavour } from "../../src/ram";
const adapter = new RamAdapter();
import { AbsMigration, Adapter, migration } from "../../src";
import { Context } from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";

const f1 = jest.fn();
const f2 = jest.fn();

@migration(RamFlavour, [async () => true])
class RamMigration extends AbsMigration<RamAdapter, any> {
  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getQueryRunner(conn: any): any {
    return {};
  }

  async up(runner: object, adapter: RamAdapter, log: Logger): Promise<void> {
    f1(runner, adapter, log);
  }

  async down(runner: object, adapter: RamAdapter, log: Logger): Promise<void> {
    f2(runner, adapter, log);
  }
}

describe("Adapter migrations", () => {
  beforeAll(async () => {
    console.log(RamMigration.name);
  });

  it("retrieves the migrations for an adapter", () => {
    const migrations = adapter.migrations();
    expect(migrations).toBeDefined();
    expect(migrations.length).toBe(1);
  });

  it("runs the up migration", async () => {
    const ctx = await adapter.context(
      "migration",
      {},
      Adapter.models(RamFlavour)
    );
    await adapter.migrate(ctx);
    expect(f1).toHaveBeenCalled();
    expect(f2).toHaveBeenCalled();
    expect(f1).toHaveBeenCalledWith({}, adapter, expect.any(Context));
    expect(f2).toHaveBeenCalledWith({}, adapter, expect.any(Context));
  });
});
