import { MigrationService } from "../../src/migrations/MigrationService";

class AdapterlessMigrationService extends MigrationService<any> {
  plan: any[] = [];
  executed: string[] = [];

  protected override buildExecutionPlan(): any[] {
    return this.plan;
  }

  protected override async executeMigration(migration: any): Promise<void> {
    this.executed.push(migration.reference);
  }
}

describe("MigrationService adapterless handlers", () => {
  it("invokes version handlers even when no persistence flavour is configured", async () => {
    const retrieveLastVersion = jest.fn(async () => "1.0.0");
    const setCurrentVersion = jest.fn(async () => undefined);

    const svc = new AdapterlessMigrationService();
    svc.plan = [{ reference: "adapterless-migration", version: "2.0.0" }];

    await svc.boot({
      targetVersion: "2.0.0",
      retrieveLastVersion,
      setCurrentVersion,
    } as any);

    await svc.migrate();

    expect(retrieveLastVersion).toHaveBeenCalledTimes(1);
    expect(retrieveLastVersion).toHaveBeenCalledWith(
      undefined,
      expect.anything()
    );
    expect(svc.executed).toEqual(["adapterless-migration"]);
    expect(setCurrentVersion).toHaveBeenCalledWith(
      "2.0.0",
      undefined,
      expect.anything()
    );
  });
});
