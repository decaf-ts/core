import { RamAdapter } from "../../src/ram";
import {
  AbsMigration,
  ConnectionForAdapter,
  migration,
  MigrationService,
} from "../../src/migrations";
import { NanoAdapter } from "../../../for-nano/src";
import {
  cleanupNanoTestResources,
  createNanoTestResources,
} from "../../../for-nano/tests/helpers/nano";
import { MaybeContextualArg } from "../../src/utils/ContextualLoggedClass";
import { ContextOf } from "../../src/persistence/types";

const NANO_FLAVOUR = "core-live-migration-multi-nano";
const RAM_FLAVOUR = "core-live-migration-multi-ram";
const NANO_TABLE = "core_multi_migration_docs";
const RAM_TABLE = "core_multi_migration_ram";
const TARGET_VERSION = "1.1.0";

const failedReferences = new Set<string>();

function failOnce(reference: string) {
  if (failedReferences.has(reference)) return;
  failedReferences.add(reference);
  throw new Error(`intentional migration failure for ${reference}`);
}

@migration("1.1.0-core-live-multi-nano", TARGET_VERSION, NANO_FLAVOUR)
class FailingNanoMigration extends AbsMigration<NanoAdapter> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(
    qr: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    adapter: NanoAdapter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<ContextOf<RamAdapter>>
  ): Promise<void> {
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(`${NANO_TABLE}__`))
      .map((doc: any) => ({
        ...doc,
        schemaVersion: TARGET_VERSION,
        requiredCategory: doc.requiredCategory || "core",
      }));

    if (docs.length) await qr.bulk({ docs });
    failOnce("nano-multi");
  }
}

@migration("1.1.0-core-live-multi-ram", TARGET_VERSION, RAM_FLAVOUR)
class RamMigration extends AbsMigration<RamAdapter> {
  protected getQueryRunner(conn: ConnectionForAdapter<RamAdapter>) {
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    adapter: RamAdapter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ...args: MaybeContextualArg<ContextOf<RamAdapter>>
  ): Promise<void> {
    const table = (qr as unknown as Map<string, any>).get(RAM_TABLE);
    if (!table) return;
    for (const [id, doc] of table.entries()) {
      table.set(id, {
        ...doc,
        ramFlag: doc.ramFlag || "seeded",
      });
    }
  }
}

void FailingNanoMigration;
void RamMigration;

// Skipped: requires link to pass due to Adapter cache.
describe.skip("MigrationService multi-adapter migration (live)", () => {
  it("stops executing later adapters when a live migration fails", async () => {
    failedReferences.clear();

    const nanoResources = await createNanoTestResources(
      "core_multi_migration_failure"
    );
    const nanoAdapter = new NanoAdapter(
      {
        user: nanoResources.user,
        password: nanoResources.password,
        host: nanoResources.host,
        dbName: nanoResources.dbName,
        protocol: nanoResources.protocol,
      },
      NANO_FLAVOUR
    );
    const ramAdapter = new RamAdapter(
      {
        user: "asdasd",
      },
      RAM_FLAVOUR
    );

    const versions: Record<string, string> = {
      [NANO_FLAVOUR]: "1.0.0",
      [RAM_FLAVOUR]: "1.0.0",
    };

    try {
      await nanoAdapter.initialize();
      await ramAdapter.initialize();

      await nanoAdapter.client.bulk({
        docs: [
          {
            _id: `${NANO_TABLE}__core-1`,
            id: "core-1",
            name: "core-product",
          },
        ],
      });

      ramAdapter.client.set(
        RAM_TABLE,
        new Map([
          [
            "ram-1",
            {
              id: "ram-1",
              name: "in-memory",
            },
          ],
        ])
      );

      await expect(
        MigrationService.migrateAdapters(
          [nanoAdapter as any, ramAdapter as any],
          {
            toVersion: TARGET_VERSION,
            handlers: {
              [NANO_FLAVOUR]: {
                retrieveLastVersion: async () => versions[NANO_FLAVOUR],
                setCurrentVersion: async (version: string) => {
                  versions[NANO_FLAVOUR] = version;
                },
              },
              [RAM_FLAVOUR]: {
                retrieveLastVersion: async () => versions[RAM_FLAVOUR],
                setCurrentVersion: async (version: string) => {
                  versions[RAM_FLAVOUR] = version;
                },
              },
            },
          } as any
        )
      ).rejects.toThrow("intentional migration failure for nano-multi");

      expect(versions[NANO_FLAVOUR]).toBe("1.0.0");
      expect(versions[RAM_FLAVOUR]).toBe("1.0.0");

      const ramTable = ramAdapter.client.get(RAM_TABLE);
      expect(ramTable?.get("ram-1")?.ramFlag).toBeUndefined();
    } finally {
      await ramAdapter.shutdown().catch(() => undefined);
      await nanoAdapter.shutdown().catch(() => undefined);
      await cleanupNanoTestResources(nanoResources);
    }
  });
});
