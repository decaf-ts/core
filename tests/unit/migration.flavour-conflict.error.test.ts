import { InternalError } from "@decaf-ts/db-decorators";
import { MigrationService } from "../../src/migrations/MigrationService";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";

function resolved(reference: string, version: string, flavour = "conflict") {
  return {
    reference,
    version,
    flavour,
    migration: {
      reference,
      precedence: null,
      flavour,
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

describe("MigrationService flavour conflict handling", () => {
  it("throws on unresolved same-version same-flavour conflicts", () => {
    const service = new MigrationService<any>();
    expect(() =>
      (service as any).sort([
        resolved("m1", "1.0.0"),
        resolved("m2", "1.0.0"),
      ])
    ).toThrow(/Unable to deterministically sort flavour migrations/);
  });

  it("throws on same-base same-flavour prerelease pairs without resolvable precedence", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();

    expect(() =>
      (service as any).sort([
        resolved("mAlpha", "1.0.0-alpha"),
        resolved("mBeta", "1.0.0-beta"),
      ])
    ).toThrow(InternalError);

    expect(() =>
      (service as any).sort([
        resolved("mAlpha", "1.0.0-alpha"),
        resolved("mBeta", "1.0.0-beta"),
      ])
    ).toThrow(/Unable to deterministically sort flavour migrations/);
  });

  it("sorts same-base exact ties across different flavours deterministically without throwing", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();

    const sorted = (service as any)
      .sort([
        resolved("mOne", "1.0.0", "two"),
        resolved("mTwo", "1.0.0", "one"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["mTwo", "mOne"]);

    const reverseSorted = (service as any)
      .sort([
        resolved("mTwo", "1.0.0", "one"),
        resolved("mOne", "1.0.0", "two"),
      ])
      .map((m: any) => m.reference);

    expect(reverseSorted).toEqual(["mTwo", "mOne"]);
  });
});
