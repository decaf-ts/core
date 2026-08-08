import { MigrationService } from "../../src/migrations/MigrationService";
import { Service } from "../../src/services/services";
import { service } from "../../src/utils/decorators";

@service()
class SingletonMigrationService extends MigrationService<any> {
  executions: any[] = [];

  protected override async migrateViaTasksWithConfig(
    cfg: any
  ): Promise<void> {
    this.executions.push(cfg);
  }
}

describe("MigrationService adapter migration handler routing", () => {
  it("routes every adapter through one decorated singleton", async () => {
    const retrieveA = jest.fn(async () => "1.0.0");
    const setA = jest.fn(async () => undefined);
    const retrieveB = jest.fn(async () => "1.1.0");
    const setB = jest.fn(async () => undefined);
    const singleton = Service.get<SingletonMigrationService>(
      SingletonMigrationService
    );
    singleton.executions = [];
    const bootSpy = jest.spyOn(singleton, "boot");

    const result = await singleton.migrateAdapters(
      [
        { alias: "adapter-a", flavour: "ram" },
        { alias: "adapter-b", flavour: "ram" },
      ] as any,
      {
        handlers: {
          "adapter-a": {
            retrieveLastVersion: retrieveA,
            setCurrentVersion: setA,
          },
          "adapter-b": {
            retrieveLastVersion: retrieveB,
            setCurrentVersion: setB,
          },
        },
        taskMode: true,
        includeGenericInTaskMode: true,
        toVersion: "2.0.0",
      } as any
    );

    expect(result).toBe(singleton);
    expect(bootSpy).not.toHaveBeenCalled();
    expect(singleton.executions).toEqual([
      expect.objectContaining({
        persistenceFlavour: "adapter-a",
        retrieveLastVersion: retrieveA,
        setCurrentVersion: setA,
        taskMode: true,
        includeGenericInTaskMode: true,
        targetVersion: "2.0.0",
      }),
      expect.objectContaining({
        persistenceFlavour: "adapter-b",
        retrieveLastVersion: retrieveB,
        setCurrentVersion: setB,
        taskMode: true,
        includeGenericInTaskMode: true,
        targetVersion: "2.0.0",
      }),
    ]);

    bootSpy.mockRestore();
  });
});
