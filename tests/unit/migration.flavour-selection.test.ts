import { MigrationService } from "../../src/migrations/MigrationService";
import { DefaultFlavour } from "@decaf-ts/decoration";

describe("MigrationService flavour selection", () => {
  const service = new MigrationService<any>();

  const generic = {
    reference: "generic",
    flavour: DefaultFlavour,
    version: "1.0.0",
    migration: {} as any,
  };

  const flavoured = {
    reference: "nano-only",
    flavour: "nano",
    version: "1.0.0",
    migration: {} as any,
  };

  it("includes generic migrations by default", () => {
    expect((service as any).shouldIncludeMigration(generic, "nano", true)).toBe(true);
    expect((service as any).shouldIncludeMigration(flavoured, "nano", true)).toBe(true);
  });

  it("excludes generic migrations when task mode opts out", () => {
    expect((service as any).shouldIncludeMigration(generic, "nano", false)).toBe(false);
    expect((service as any).shouldIncludeMigration(flavoured, "nano", false)).toBe(true);
  });
});
