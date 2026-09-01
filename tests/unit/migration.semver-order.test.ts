import { MigrationService } from "../../src/migrations/MigrationService";
import { SemverMigrationVersioning } from "../../src/migrations/SemverMigrationVersioning";
import { StandardMigrationVersioning } from "../../src/migrations/StandardMigrationVersioning";

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

describe("MigrationService declared precedence over prerelease order", () => {
  it("puts declared precedence ahead of prerelease lexical order within the same base version", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const alpha = resolved("mAlpha", "1.0.0-alpha", [{ reference: "mRc" }]);
    const rc = resolved("mRc", "1.0.0-rc");

    const sorted = (service as any)
      .sort([alpha, rc])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["mRc", "mAlpha"]);
  });

  it("ranks base versions above declared precedence across different bases", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const low = resolved("mLow", "1.0.0", [{ reference: "mHigh" }]);
    const high = resolved("mHigh", "2.0.0");

    const sorted = (service as any)
      .sort([high, low])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["mLow", "mHigh"]);
  });

  it("still reorders same-base exact version ties through declared precedence", () => {
    const service = new MigrationService<any>();
    (service as any).versioning = new SemverMigrationVersioning();
    const tieA = resolved("mTieA", "2.0.0");
    const tieB = resolved("mTieB", "2.0.0", [{ reference: "mTieA" }]);

    const sorted = (service as any)
      .sort([tieB, tieA])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["mTieA", "mTieB"]);
  });
});

describe("MigrationVersioning base extraction", () => {
  it("treats each full version as its own base under the legacy strategy and sorts prerelease-looking versions lexically without throwing", () => {
    const legacy = new StandardMigrationVersioning();
    expect(legacy.base?.("0.2.0-alpha")).toBe("0.2.0-alpha");
    expect(legacy.base?.("0.2.0-alpha+build.1")).toBe(
      "0.2.0-alpha+build.1"
    );
    expect(legacy.base?.("not-a-version")).toBe("not-a-version");

    const service = new MigrationService<any>();
    expect((service as any).versioning).toBeInstanceOf(
      StandardMigrationVersioning
    );

    const sorted = (service as any)
      .sort([
        resolved("mLegacyB", "0.2.0-beta"),
        resolved("mLegacyA", "0.2.0-alpha"),
      ])
      .map((m: any) => m.reference);

    expect(sorted).toEqual(["mLegacyA", "mLegacyB"]);
  });

  it("extracts the core version for semver entries and falls back to identity for non-semver entries", () => {
    const semverVersioning = new SemverMigrationVersioning();
    expect(semverVersioning.base?.("1.0.0-alpha+build.1")).toBe("1.0.0");
    expect(semverVersioning.base?.("1.0.0-alpha")).toBe("1.0.0");
    expect(semverVersioning.base?.("1.0.0")).toBe("1.0.0");
    expect(semverVersioning.base?.("not-a-version")).toBeUndefined();
  });
});
