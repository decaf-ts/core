import { RamAdapter, RamConfig, RamFlags, RamFlavour } from "../../src/ram";
const adapter = new RamAdapter();
import { AbsMigration, migration } from "../../src";
import { Context } from "@decaf-ts/db-decorators";
import { Logger, MiniLogger } from "@decaf-ts/logging";

const f1 = jest.fn();
const f2 = jest.fn();

@migration(RamFlavour, [async () => true])
class RamMigration extends AbsMigration<
  RamAdapter,
  RamConfig,
  any,
  any,
  any,
  RamFlags,
  Context<RamFlags>
> {
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
    await adapter.migrate();
    expect(f1).toHaveBeenCalled();
    expect(f2).toHaveBeenCalled();
    expect(f1).toHaveBeenCalledWith({}, adapter, expect.any(MiniLogger));
    expect(f2).toHaveBeenCalledWith({}, adapter, expect.any(MiniLogger));
  });
});
