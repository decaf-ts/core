import { Adapter } from "../../src/persistence/Adapter";
import { RamAdapter } from "../../src/ram";
import { AbsMigration, migration, MigrationService } from "../../src/migrations";
import { MultiLock } from "@decaf-ts/transactional-decorators";

const MIGRATION_FLAVOUR = "core-task-mode-ram";
const TABLE = "core_task_migration_docs";
const TARGET_VERSION = "1.1.0";

class LiveRamMigrationAdapter extends RamAdapter {
  constructor(conf: any = {}, alias?: string) {
    super(conf, alias);
    (this as any).flavour = MIGRATION_FLAVOUR;
    (Adapter as any)._cache[MIGRATION_FLAVOUR] = this;
  }
}

@migration("1.1.0-core-task-migration", TARGET_VERSION, MIGRATION_FLAVOUR)
class TaskModeMigration extends AbsMigration<
  LiveRamMigrationAdapter,
  Map<string, Map<string, any>>
> {
  protected getQueryRunner(conn: LiveRamMigrationAdapter): Map<string, Map<string, any>> {
    return conn.client;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(qr: Map<string, Map<string, any>>): Promise<void> {
    const table = qr.get(TABLE);
    if (!table) return;
    for (const [id, doc] of table.entries()) {
      table.set(id, {
        ...doc,
        migrated: doc.migrated || "true",
      });
    }
  }
}

void TaskModeMigration;

describe("MigrationService version persistence", () => {
  it("records the target version after a live schema migration", async () => {
    const migrationAdapter = new LiveRamMigrationAdapter(
      { lock: new MultiLock() },
      "core-task-migration-adapter"
    );
    const versions: Record<string, string> = {
      [MIGRATION_FLAVOUR]: "1.0.0",
    };

    try {
      await migrationAdapter.initialize();
      migrationAdapter.client.set(
        TABLE,
        new Map([
          [
            "task-1",
            {
              id: "task-1",
              name: "live-task",
            },
          ],
        ])
      );

      await MigrationService.migrateAdapters([migrationAdapter as any], {
        toVersion: TARGET_VERSION,
        handlers: {
          [MIGRATION_FLAVOUR]: {
            retrieveLastVersion: async () => versions[MIGRATION_FLAVOUR],
            setCurrentVersion: async (version: string) => {
              versions[MIGRATION_FLAVOUR] = version;
            },
          },
        },
      } as any);

      expect(versions[MIGRATION_FLAVOUR]).toBe(TARGET_VERSION);
      const stored = migrationAdapter.client.get(TABLE)?.get("task-1");
      expect(stored?.migrated).toBe("true");
    } finally {
      await migrationAdapter.shutdown().catch(() => undefined);
    }
  });
});
