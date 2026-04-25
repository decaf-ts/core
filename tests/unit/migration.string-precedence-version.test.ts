import { migration } from "../../src/migrations/decorators";
import { MigrationService } from "../../src/migrations/MigrationService";
import { AbsMigration } from "../../src/migrations/Migration";
import { PersistenceKeys } from "../../src/persistence/constants";
import { Metadata } from "@decaf-ts/decoration";

@migration("2.1.0-sample-migration", "2.1.0", "nano")
class StringVersionPrecedenceMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async migrate(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }
}

describe("Migration string precedence version hint", () => {
  it("stores version hint in precedence when second argument is semver", () => {
    const meta = Metadata.get(
      StringVersionPrecedenceMigration as any,
      PersistenceKeys.MIGRATION
    ) as any;

    expect(meta.precedence).toBe("2.1.0");
    expect(meta.flavour).toBe("nano");
  });

  it("evaluates precedence hint against reference while resolving version", () => {
    const service = new MigrationService<any>();

    const migration = {
      reference: "2.1.0-sample-migration",
      precedence: "2.1.0",
      flavour: "nano",
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
    } as any;

    const resolved = (service as any).resolveMigration(migration);
    expect(resolved.version).toBe("2.1.0");
  });
});
