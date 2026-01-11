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

@migration("one", RamFlavour, [async () => true])
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
    f1("1", adapter, log);
  }

  async migrate(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.migrate);
    fMigrate("1", adapter, log);
  }

  async down(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    f2("1", adapter, log);
  }
}

@migration("other", RamMigration, RamFlavour, [async () => true])
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { log } = this.logCtx(args, this.up);
    f1("2", adapter, ...args);
  }

  async migrate(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { log } = this.logCtx(args, this.migrate);
    fMigrate("2", adapter, ...args);
  }

  async down(
    runner: object,
    adapter: RamAdapter,
    ...args: ContextualArgs<RamContext>
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { log } = this.logCtx(args, this.down);
    f2("2", adapter, ...args);
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
    expect(f1).toHaveBeenCalledTimes(2);
    expect(fMigrate).toHaveBeenCalledTimes(2);
    expect(f2).toHaveBeenCalledTimes(2);

    expect(f1).toHaveBeenNthCalledWith(
      1,
      expect.any("1"),
      expect.any(RamAdapter),
      expect.any(Context)
    );
    expect(f1).toHaveBeenNthCalledWith(
      2,
      expect.any("2"),
      expect.any(OtherAdapter),
      expect.any(Context)
    );

    expect(fMigrate).toHaveBeenNthCalledWith(
      1,
      expect.any("1"),
      expect.any(RamAdapter),
      expect.any(Context)
    );
    expect(fMigrate).toHaveBeenNthCalledWith(
      2,
      expect.any("2"),
      expect.any(OtherAdapter),
      expect.any(Context)
    );

    expect(f2).toHaveBeenNthCalledWith(
      1,
      expect.any("1"),
      expect.any(RamAdapter),
      expect.any(Context)
    );
    expect(f2).toHaveBeenNthCalledWith(
      2,
      expect.any("2"),
      expect.any(OtherAdapter),
      expect.any(Context)
    );
  });
});
