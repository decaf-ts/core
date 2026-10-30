import { Metadata } from "@decaf-ts/decoration";
import { RamAdapter, RamFlavour } from "../../src/ram";
import { AbsMigration, migration, MigrationService } from "../../src/migrations";
import { PersistenceKeys } from "../../src/persistence/constants";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";

const NAME_ONLY_REFERENCE = "zero-day-seed";

@migration(NAME_ONLY_REFERENCE, RamFlavour)
class NameOnlyMigration extends AbsMigration<RamAdapter> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {}
  async migrate(): Promise<void> {}
  async down(): Promise<void> {}
}

describe("unversioned migrations", () => {
  it("remain registered but enter a plan only when explicitly selected by reference", () => {
    const metadata = Metadata.get(
      NameOnlyMigration as any,
      PersistenceKeys.MIGRATION
    ) as any;
    expect(metadata.precedence).toBeNull();

    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const sort = jest.spyOn(service as any, "sort");

    const automatic = (service as any).buildExecutionPlan({
      targetFlavour: RamFlavour,
      toVersion: "99.0.0",
    });
    expect(automatic.some((item: any) => item.reference === NAME_ONLY_REFERENCE)).toBe(false);
    expect(
      sort.mock.calls.flatMap(([migrations]: any[]) => migrations)
        .some((item: any) => item.reference === NAME_ONLY_REFERENCE)
    ).toBe(false);

    (service as any).allowedReferences = new Set([NAME_ONLY_REFERENCE]);
    const explicitlyNamed = (service as any).buildExecutionPlan({
      targetFlavour: RamFlavour,
      fromVersion: "99.0.0",
      toVersion: "0.0.0",
    });
    expect(explicitlyNamed.map((item: any) => item.reference)).toEqual([
      NAME_ONLY_REFERENCE,
    ]);
    expect(sort.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});
