import { MigrationService } from "../../src/migrations/MigrationService";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";

function resolved(reference: string, version: string, flavour = "test") {
  return {
    reference,
    version,
    flavour,
    migration: {
      reference,
      flavour,
      transaction: false,
      async up() {},
      async migrate() {},
      async down() {},
    },
  };
}

describe("MigrationService references filtering", () => {
  function buildService(references: string[]) {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    (service as any).allowedReferences = references.length
      ? new Set(references)
      : undefined;
    return service;
  }

  function applyFilter(service: MigrationService<any>, migrations: any[]) {
    return migrations.filter((m) => {
      const allowed: Set<string> | undefined = (service as any).allowedReferences;
      if (allowed && !allowed.has(m.reference)) return false;
      return true;
    });
  }

  it("passes all migrations when no references filter is set", () => {
    const service = buildService([]);
    const migrations = [
      resolved("mig-a", "1.0.0"),
      resolved("mig-b", "1.1.0"),
      resolved("mig-c", "2.0.0"),
    ];
    const filtered = applyFilter(service, migrations);
    expect(filtered.map((m) => m.reference)).toEqual(["mig-a", "mig-b", "mig-c"]);
  });

  it("restricts to only the named references when set", () => {
    const service = buildService(["mig-a", "mig-c"]);
    const migrations = [
      resolved("mig-a", "1.0.0"),
      resolved("mig-b", "1.1.0"),
      resolved("mig-c", "2.0.0"),
    ];
    const filtered = applyFilter(service, migrations);
    expect(filtered.map((m) => m.reference)).toEqual(["mig-a", "mig-c"]);
  });

  it("returns empty when references filter matches nothing", () => {
    const service = buildService(["nonexistent"]);
    const migrations = [
      resolved("mig-a", "1.0.0"),
      resolved("mig-b", "1.1.0"),
    ];
    const filtered = applyFilter(service, migrations);
    expect(filtered).toHaveLength(0);
  });

  it("references config threads through initialize()", async () => {
    const service = new MigrationService<any>();
    await (service as any).initialize({
      references: ["only-this"],
      toVersion: "99.0.0",
    });
    const allowed: Set<string> | undefined = (service as any).allowedReferences;
    expect(allowed).toBeInstanceOf(Set);
    expect(allowed?.has("only-this")).toBe(true);
    expect(allowed?.has("something-else")).toBe(false);
  });

  it("allowedReferences is undefined when references array is empty", async () => {
    const service = new MigrationService<any>();
    await (service as any).initialize({ references: [], toVersion: "1.0.0" });
    expect((service as any).allowedReferences).toBeUndefined();
  });
});
