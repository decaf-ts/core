import { MigrationService } from "../../src/migrations/MigrationService";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";

function resolved(reference: string, version: string) {
  return {
    reference,
    version,
    flavour: "test",
    migration: {
      reference,
      precedence: null,
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
    },
  };
}

describe("MigrationService legacy versioning default", () => {
  it("uses legacy lexical ordering by default", () => {
    const service = new MigrationService<any>();
    const sorted = (service as any)
      .sort([
        resolved("1.10.0", "1.10.0"),
        resolved("1.2.0", "1.2.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["1.10.0", "1.2.0"]);
  });

  it("can still switch to semver strategy when injected", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const sorted = (service as any)
      .sort([
        resolved("1.10.0", "1.10.0"),
        resolved("1.2.0", "1.2.0"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["1.2.0", "1.10.0"]);
  });
});
