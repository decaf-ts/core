import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { task } from "../tasks/decorators";
import { TaskHandler } from "../tasks/TaskHandler";
import { TaskContext } from "../tasks/TaskContext";
import { InternalError } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import { Migration } from "./types";

export interface MigrationStepInput {
  reference: string;
  args?: any[];
}

@task("migration")
export class MigrationTask extends TaskHandler<MigrationStepInput, void> {
  async run(input: MigrationStepInput, ctx: TaskContext): Promise<void> {
    ctx.logger.info(`Executing migration ${input.reference}`);
    const manifest = Metadata.migrations().find(
      ([reference]) => reference === input.reference
    );
    if (!manifest)
      throw new InternalError(
        `Migration ${input.reference} is not registered with the metadata layer`
      );

    const MigrationClass = manifest[1];
    let migration: Migration<any, any>;
    try {
      migration = new MigrationClass();
    } catch (err: unknown) {
      throw new InternalError(
        `Failed to instantiate migration ${input.reference}: ${err}`
      );
    }

    const meta = Metadata.get(
      migration.constructor as any,
      PersistenceKeys.MIGRATION
    );
    const flavour = meta?.flavour || migration.flavour;
    const adapter = Adapter.get(flavour);
    if (!adapter)
      throw new InternalError(
        `Unable to resolve adapter for migration ${input.reference}`
      );

    const qr = adapter.client;
    const args = input.args ?? [];
    //
    // if (typeof (migration as any).boot === "function") {
    //   await (migration as any).boot(...args, ctx);
    // }

    try {
      await migration.up(qr, adapter, ...args, ctx);
    } catch (e: unknown) {
      ctx.logger.error(`Up phase for ${input.reference} failed: ${e}`);
      // await ctx.flush();
      return;
    }

    try {
      await migration.migrate(qr, adapter, ...args, ctx);
    } catch (e: unknown) {
      ctx.logger.error(`migration phase for ${input.reference} failed: ${e}`);
      // await ctx.flush();
      return;
    }
    try {
      await migration.down(qr, adapter, ...args, ctx);
    } catch (e: unknown) {
      ctx.logger.error(`down phase for ${input.reference} failed: ${e}`);
      // await ctx.flush();
      return;
    }
    ctx.logger.info(`migration ${input.reference} completed`);
  }
}
