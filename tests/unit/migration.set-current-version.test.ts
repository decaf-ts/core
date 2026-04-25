import { RamAdapter, RamFlavour } from "../../src/ram";
import { MigrationService } from "../../src/migrations/MigrationService";

class ControlledMigrationService extends MigrationService<true, RamAdapter> {
  plan: any[] = [];

  protected override buildExecutionPlan(): any[] {
    return this.plan;
  }

  protected override async executeMigration(): Promise<void> {
    return;
  }
}

describe("MigrationService setCurrentVersion", () => {
  beforeAll(async () => {
    const adapter = new RamAdapter(undefined as any, "migration-version-test");
    await adapter.initialize();
  });

  it("persists target version after successful migration", async () => {
    const setCurrentVersion = jest.fn(async () => undefined);

    const svc = new ControlledMigrationService();
    svc.plan = [];

    await svc.boot({
      persistenceFlavour: RamFlavour,
      targetVersion: "3.0.0",
      setCurrentVersion,
    } as any);

    await svc.migrate();

    expect(setCurrentVersion).toHaveBeenCalledWith(
      "3.0.0",
      expect.any(RamAdapter),
      expect.anything()
    );
  });
});
