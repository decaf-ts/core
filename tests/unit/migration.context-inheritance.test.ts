import { Adapter } from "../../src/persistence/Adapter";
import { Context } from "../../src/persistence/Context";
import { PersistenceService } from "../../src/services/PersistenceService";
import { AbsMigration, migration } from "../../src/migrations";
import { ContextualArgs } from "../../src";
import { RamAdapter, RamContext } from "../../src/ram";

class ContextInheritanceAdapter extends RamAdapter {
  constructor(cfg?: any) {
    super(cfg, "context-inheritance");
  }
}

const seen: Array<{
  phase: "up" | "migrate" | "down";
  supplied: RamContext;
  derived: RamContext;
}> = [];

@migration("context-inheritance", "context-inheritance", [async () => true])
class ContextInheritanceMigration extends AbsMigration<
  ContextInheritanceAdapter,
  void
> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(
    runner: object,
    adapter: ContextInheritanceAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { ctx } = this.logCtx(args, this.up);
    seen.push({
      phase: "up",
      supplied: args[0] as RamContext,
      derived: ctx as RamContext,
    });
  }

  async migrate(
    runner: object,
    adapter: ContextInheritanceAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { ctx } = this.logCtx(args, this.migrate);
    seen.push({
      phase: "migrate",
      supplied: args[0] as RamContext,
      derived: ctx as RamContext,
    });
  }

  async down(
    runner: object,
    adapter: ContextInheritanceAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { ctx } = this.logCtx(args, this.down);
    seen.push({
      phase: "down",
      supplied: args[0] as RamContext,
      derived: ctx as RamContext,
    });
  }
}

describe("Migration context inheritance", () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it("preserves inherited flags when up/down derive a new context", async () => {
    const persistence = new PersistenceService<ContextInheritanceAdapter>();
    await persistence.boot([[ContextInheritanceAdapter, { user: "ctx-test" }]]);

    const adapter = Adapter.get("context-inheritance") as ContextInheritanceAdapter;
    const inputCtx = new Context().accumulate({
      UUID: "uuid-123",
      allowRawStatements: true,
    }) as RamContext;

    const migration = new ContextInheritanceMigration();
    await migration.up(adapter as any, adapter, inputCtx);
    await migration.migrate(adapter as any, adapter, inputCtx);
    await migration.down(adapter as any, adapter, inputCtx);

    expect(seen).toHaveLength(3);

    for (const entry of seen) {
      expect(entry.supplied.get("UUID")).toBe("uuid-123");
      expect(entry.derived.get("UUID")).toBe("uuid-123");
      expect(entry.supplied.get("allowRawStatements")).toBe(true);
      expect(entry.derived.get("allowRawStatements")).toBe(true);
      expect(entry.derived).toBe(entry.supplied);
    }

    expect(seen.find((entry) => entry.phase === "up")?.supplied).not.toBe(
      inputCtx
    );
    expect(seen.find((entry) => entry.phase === "down")?.supplied).not.toBe(
      inputCtx
    );
    expect(seen.find((entry) => entry.phase === "migrate")?.supplied).toBe(
      inputCtx
    );
  });
});
