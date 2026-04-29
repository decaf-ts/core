import { RamAdapter, RamFlavour } from "../../src/ram";
import { MigrationService } from "../../src/migrations/MigrationService";

class ControlledMigrationService extends MigrationService<true, RamAdapter> {
  plan: any[] = [];
  executed: string[] = [];

  protected override buildExecutionPlan(): any[] {
    return this.plan;
  }

  protected override async executeMigration(migration: any, ...): Promise<void> {
    this.executed.push(migration.reference);
  }
}

describe("MigrationService retrieveLastVersion", () => {
  beforeAll(async () => {
    const adapter = new RamAdapter(undefined as any, "migration-handler-test");
    await adapter.initialize();
  });

  it("loads last version asynchronously before planning", async () => {
    const retrieveLastVersion = jest.fn(async () => "1.0.0");
    const setCurrentVersion = jest.fn(async () => undefined);

    const svc = new ControlledMigrationService();
    svc.plan = [
      { reference: "m-1-1-0", version: "1.1.0" },
      { reference: "m-2-0-0", version: "2.0.0" },
    ];

    await svc.boot({
      persistenceFlavour: RamFlavour,
      retrieveLastVersion,
      setCurrentVersion,
    } as any);

    await svc.migrate();

    expect(retrieveLastVersion).toHaveBeenCalledTimes(1);
    expect(svc.executed).toEqual(["m-1-1-0", "m-2-0-0"]);
    expect(setCurrentVersion).toHaveBeenCalledWith(
      "2.0.0",
      expect.any(RamAdapter),
      expect.anything()
    );
  });
});
