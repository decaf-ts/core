import { MigrationService } from "../../src/migrations/MigrationService";

describe("MigrationService adapter migration handler routing", () => {
  it("routes adapter handler configuration into MigrationService", async () => {
    const retrieveLastVersion = jest.fn(async () => "1.0.0");
    const setCurrentVersion = jest.fn(async () => undefined);

    const bootSpy = jest
      .spyOn(MigrationService.prototype as any, "boot")
      .mockResolvedValue(undefined);
    const migrateSpy = jest
      .spyOn(MigrationService.prototype as any, "migrateViaTasks")
      .mockResolvedValue(undefined);

    await MigrationService.migrateAdapters(
      [{ alias: "adapter-a", flavour: "ram" }] as any,
      {
        handlers: {
          "adapter-a": {
            retrieveLastVersion,
            setCurrentVersion,
          },
        },
        taskMode: true,
        toVersion: "2.0.0",
      } as any
    );

    expect(bootSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        persistenceFlavour: "adapter-a",
        retrieveLastVersion,
        setCurrentVersion,
        taskMode: true,
        targetVersion: "2.0.0",
      })
    );
    expect(migrateSpy).toHaveBeenCalledTimes(1);

    bootSpy.mockRestore();
    migrateSpy.mockRestore();
  });
});
