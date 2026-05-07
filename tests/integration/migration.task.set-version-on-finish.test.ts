import { RamAdapter } from "../../src/ram";
import {
  AbsMigration,
  ConnectionForAdapter,
  migration,
  MigrationService,
} from "../../src/migrations";
import { MultiLock } from "@decaf-ts/transactional-decorators";
import {
  ContextOf,
  MaybeContextualArg,
  PersistenceKeys,
} from "../../src/index";

const MIGRATION_FLAVOUR = "core-task-mode-ram";
const TABLE = "core_task_migration_docs";
const TARGET_VERSION = "1.1.0";

@migration("1.1.0-core-task-migration", TARGET_VERSION, MIGRATION_FLAVOUR)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class TaskModeMigration extends AbsMigration<RamAdapter> {
  protected getQueryRunner(
    conn: ConnectionForAdapter<RamAdapter>
  ): ConnectionForAdapter<RamAdapter> {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(
    qr: ConnectionForAdapter<RamAdapter>,

    adapter: RamAdapter,

    ...args: MaybeContextualArg<ContextOf<RamAdapter>>
  ): Promise<void> {
    const { log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrate);
    log.info("migrating");
    const table = (qr as unknown as Map<string, any>).get(TABLE);
    if (!table) return;
    for (const [id, doc] of table.entries()) {
      table.set(id, {
        ...doc,
        migrated: doc.migrated || "true",
      });
    }
  }
}

describe("MigrationService version persistence", () => {
  it("records the target version after a live schema migration", async () => {
    const migrationAdapter = new RamAdapter(
      { user: "user", lock: new MultiLock() },
      MIGRATION_FLAVOUR
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
