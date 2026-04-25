import { MigrationService } from "../../src/migrations/MigrationService";

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
});
