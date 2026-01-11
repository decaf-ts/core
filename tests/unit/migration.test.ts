import { RamAdapter, RamConfig, RamContext, RamFlavour } from "../../src/ram";
import { ContextualArgs, PersistenceService } from "../../src";
import { Context } from "@decaf-ts/db-decorators";
import {
  AbsMigration,
  migration,
  MigrationService,
} from "../../src/migrations";

const f1 = jest.fn();
const fMigrate = jest.fn();
const f2 = jest.fn();

class OtherAdapter extends RamAdapter {
  constructor(cfg?: RamConfig) {
    super(cfg, "other");
  }
}

@migration(RamFlavour, [async () => true])
class RamMigration extends AbsMigration<RamAdapter, any> {
  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getQueryRunner(conn: any): any {
    return {};
  }

  async up(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.up);
    f1(runner, adapter, log);
  }

  async migrate(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.migrate);
    fMigrate(runner, adapter, log);
  }

  async down(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    f2(runner, adapter, log);
  }
}

@migration("other", [async () => true])
class OtherMigration extends AbsMigration<OtherAdapter, any> {
  constructor() {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected getQueryRunner(conn: any): any {
    return {};
  }

  async up(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.up);
    f1(runner, adapter, log);
  }

  async migrate(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.migrate);
    fMigrate(runner, adapter, log);
  }

  async down(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    f2(runner, adapter, log);
  }
}

describe("Adapter migrations", () => {
  let service: PersistenceService<any>;
  let migrations: MigrationService<any>;
  beforeAll(async () => {
    console.log(RamMigration.name);
  });

  it("boots the persistence service", async () => {
    service = new PersistenceService();
    await service.boot([
      [RamAdapter, { user: "hi" }],
      [OtherAdapter, { user: "hello" }],
    ]);
  });

  it("loads the migration service", async () => {
    migrations = new MigrationService();
    await migrations.boot();
    expect(migrations).toBeInstanceOf(MigrationService);
  });

  it("runs migrations", async () => {
    await migrations.migrate();
    expect(f1).toHaveBeenCalled();
    expect(f2).toHaveBeenCalled();
    expect(f1).toHaveBeenCalledWith(
      {},
      expect.any(RamAdapter),
      expect.any(Context)
    );
    expect(f2).toHaveBeenCalledWith(
      {},
      expect.any(OtherAdapter),
      expect.any(Context)
    );
  });
});
