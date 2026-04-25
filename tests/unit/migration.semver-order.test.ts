import { MigrationService } from "../../src/migrations/MigrationService";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";

function resolved(reference: string, version: string, precedence: any = null) {
  const migration = {
    reference,
    precedence,
    flavour: "test",
    transaction: true,
    async up() {
      return;
    },
    async migrate() {
      return;
    },
    async down() {
      return;
    },
  };
  return {
    migration,
    reference,
    version,
    flavour: "test",
  };
}

describe("MigrationService semver ordering", () => {
  it("orders migrations by semver", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const sorted = (service as any)
      .sort([
        resolved("m-1-10-0", "1.10.0"),
        resolved("m-1-2-0", "1.2.0"),
        resolved("m-1-0-0", "1.0.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["m-1-0-0", "m-1-2-0", "m-1-10-0"]);
  });

  it("uses precedence as tie breaker inside same version", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const first = resolved("first", "2.0.0");
    const second = resolved("second", "2.0.0", [{ reference: "first" }]);

    const sorted = (service as any).sort([second, first]).map((m: any) => m.reference);
    expect(sorted).toEqual(["first", "second"]);
  });
});
