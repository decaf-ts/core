import { DefaultMigrationConfig } from "./constants";
import {
  Migration,
  MigrationConfig,
  PersistenceMigrationConfig,
} from "./types";
import { ClientBasedService, Service } from "../services/services";
import { Adapter } from "../persistence/Adapter";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationError } from "../persistence/errors";
import { ContextOf } from "../persistence/types";
import {
  ContextualArgs,
  MaybeContextualArg,
} from "../utils/ContextualLoggedClass";
import { style } from "@decaf-ts/logging";
import { DefaultFlavour, Metadata } from "@decaf-ts/decoration";
import { InternalError } from "@decaf-ts/db-decorators";
import { MigrationTaskBuilder } from "./MigrationTaskBuilder";
import { MigrationStepInput } from "./MigrationTasks";
import { TaskModel } from "../tasks/models/TaskModel";
import { MigrationVersioning } from "./MigrationVersioning";
import { StandardMigrationVersioning } from "./StandardMigrationVersioning";
import { TaskStatus } from "../tasks/constants";

type ResolvedMigration = {
  migration: Migration<any, any>;
  flavour: string;
  reference: string;
  version: string;
};

type VersionTask = {
  version: string;
  task: TaskModel;
};

export class MigrationService<
    PERSIST extends boolean,
    A extends Adapter<any, any, any, any> = any,
    R = void,
  >
  extends ClientBasedService<
    PERSIST extends boolean ? A : void,
    MigrationConfig<PERSIST>
  >
  implements Migration<A, R>
{
  protected versioning: MigrationVersioning = new StandardMigrationVersioning();
  protected queuedTaskChain: Array<{ id: string; version: string }> = [];
  flavour?: string;
  readonly reference: string = MigrationService.name;
  readonly precedence: Migration<any, any> | Migration<any, any>[] | null =
    null;
  transaction!: boolean;

  constructor() {
    super();
  }

  static async migrateAdapters<
    AD extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
  >(
    adapters: AD[],
    cfg: PersistenceMigrationConfig<AD> = {},
    ...args: MaybeContextualArg<ContextOf<AD>>
  ): Promise<MigrationService<true, AD>[]> {
    const flavours = cfg.flavours?.length ? new Set(cfg.flavours) : undefined;
    const selected = adapters.filter(
      (adapter) => !flavours || flavours.has(adapter.alias)
    );
    const migratingAliases = new Set(
      adapters.map((adapter) => adapter.alias).filter(Boolean)
    );

    const taskEngineClient = cfg.taskService?.client as any;
    const taskServiceAdapterAlias =
      taskEngineClient?.adapter?.alias || taskEngineClient?.adapter?.flavour;
    if (
      taskServiceAdapterAlias &&
      migratingAliases.has(taskServiceAdapterAlias)
    ) {
      throw new InternalError(
        `TaskEngine adapter alias "${taskServiceAdapterAlias}" cannot participate in the migration targets`
      );
    }
    const services: MigrationService<true, AD>[] = [];

    for (const adapter of selected) {
      const scope = adapter.alias;
      const handlers =
        cfg.handlers?.[scope] || cfg.handlers?.[adapter.flavour] || {};
      const migrationService = new MigrationService<true, AD>();
      services.push(migrationService);
      await migrationService.boot({
        persistenceFlavour: scope,
        targetVersion: cfg.toVersion,
        taskMode: !!cfg.taskMode,
        // In multi-adapter task mode, run flavour-scoped migrations only.
        includeGenericInTaskMode: !(cfg.taskMode && selected.length > 1),
        retrieveLastVersion: handlers.retrieveLastVersion as any,
        setCurrentVersion: handlers.setCurrentVersion as any,
        taskService: cfg.taskService,
      } as any);

      if (cfg.taskMode)
        await migrationService.migrateViaTasks(undefined, undefined, ...args);
      else
        await migrationService.migrateNormally(undefined, undefined, ...args);
    }

    return services;
  }

  async initialize(...args: MaybeContextualArg<ContextOf<A>>): Promise<{
    config: MigrationConfig<PERSIST>;
    client: PERSIST extends boolean ? A : void;
  }> {
    const { log, ctx } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const persistence = Service.get(PersistenceKeys.PERSISTENCE);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      if (!ctx.get("ignoreDevSafeGuards"))
        log.warn(
          `Persistence service not available. this may indicate poor initialization of the persistence layer (or not)`
        );
    }

    const cfg: MigrationConfig<PERSIST> = Object.assign(
      {},
      args.length ? args[0] : DefaultMigrationConfig,
      DefaultMigrationConfig
    );
    this.versioning = cfg.versioning || new StandardMigrationVersioning();
    this.transaction = cfg.persistMigrationSteps;
    return {
      config: cfg,
      client: (cfg.persistenceFlavour
        ? Adapter.get(cfg.persistenceFlavour)
        : undefined) as PERSIST extends boolean ? A : void,
    };
  }

  async down(
    qr: any,
    adapter: any,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    log.verbose(style("Cleaning up after all migrations").green.bold);
  }

  protected normalizeVersion(raw: string, precedenceHint?: string): string {
    return this.versioning.normalize(raw, precedenceHint);
  }

  protected extractPrecedenceTokens(migration: Migration<any, any>): string[] {
    const precedence = migration.precedence;
    if (!precedence) return [];
    const list = Array.isArray(precedence) ? precedence : [precedence];
    return list
      .map((entry: any) => {
        if (!entry) return undefined;
        if (typeof entry === "string") return undefined;
        if (typeof entry === "function") return entry.name;
        if (typeof entry.reference === "string") return entry.reference;
        if (entry.constructor?.name) return entry.constructor.name;
        return undefined;
      })
      .filter((entry): entry is string => !!entry);
  }

  protected referencesMigration(
    candidate: Migration<any, any>,
    target: ResolvedMigration
  ): boolean {
    const tokens = this.extractPrecedenceTokens(candidate);
    if (!tokens.length) return false;
    return (
      tokens.includes(target.reference) ||
      tokens.includes((target.migration as any)?.constructor?.name)
    );
  }

  protected precedenceHint(migration: Migration<any, any>): string | undefined {
    return typeof migration.precedence === "string"
      ? migration.precedence
      : undefined;
  }

  protected compareByPrecedence(
    migration1: ResolvedMigration,
    migration2: ResolvedMigration
  ): number {
    const m1 = migration1.migration;
    const m2 = migration2.migration;

    const m1ReferencesM2 = this.referencesMigration(m1, migration2);
    const m2ReferencesM1 = this.referencesMigration(m2, migration1);

    if (m1ReferencesM2 && !m2ReferencesM1) return 1;
    if (m2ReferencesM1 && !m1ReferencesM2) return -1;

    const p1 = this.extractPrecedenceTokens(m1);
    const p2 = this.extractPrecedenceTokens(m2);
    if (p1.length !== p2.length) return p1.length - p2.length;

    return 0;
  }

  protected sort(migrations: ResolvedMigration[]) {
    const sorted = [...migrations].sort((migration1, migration2) => {
      const semverDelta = this.versioning.compare(
        migration1.version,
        migration2.version
      );
      if (semverDelta !== 0) return semverDelta;

      const precedenceDelta = this.compareByPrecedence(migration1, migration2);
      if (precedenceDelta !== 0) return precedenceDelta;

      const flavourDelta = migration1.flavour.localeCompare(migration2.flavour);
      if (flavourDelta !== 0) return flavourDelta;

      return migration1.reference.localeCompare(migration2.reference);
    });

    for (let i = 0; i < sorted.length; i++) {
      const left = sorted[i];
      const right = sorted[i + 1];
      if (!left || !right) continue;
      if (left.version !== right.version || left.flavour !== right.flavour)
        continue;
      if (this.compareByPrecedence(left, right) !== 0) continue;
      throw new InternalError(
        `Unable to deterministically sort flavour migrations for version ${left.version} and flavour ${left.flavour}: ${left.reference} vs ${right.reference}`
      );
    }

    return sorted;
  }

  protected resolveMigration(
    migration: Migration<any, any>
  ): ResolvedMigration {
    const meta = Metadata.get(
      migration.constructor as any,
      PersistenceKeys.MIGRATION
    );
    const flavour =
      (meta?.flavour as string | undefined) ||
      migration.flavour ||
      DefaultFlavour;
    const reference =
      (meta?.reference as string | undefined) || migration.reference;
    const precedenceHint = this.precedenceHint(migration);

    return {
      migration,
      flavour,
      reference,
      version: this.normalizeVersion(reference, precedenceHint),
    };
  }

  protected shouldIncludeMigration(
    migration: ResolvedMigration,
    targetFlavour?: string,
    includeGeneric = true
  ) {
    if (!targetFlavour) return true;
    if (migration.flavour === targetFlavour) return true;
    return includeGeneric && migration.flavour === DefaultFlavour;
  }

  protected collectMigrations(
    targetFlavour?: string,
    includeGeneric = true
  ): ResolvedMigration[] {
    const toBoot = Metadata.migrations();
    const migrations: ResolvedMigration[] = [];

    for (const [reference, MigrationClass] of toBoot) {
      let migration: Migration<any, any>;
      try {
        migration = new MigrationClass();
      } catch (e: unknown) {
        throw new InternalError(
          `failed to create migration ${reference}: ${e}`
        );
      }
      const resolved = this.resolveMigration(migration);
      if (!this.shouldIncludeMigration(resolved, targetFlavour, includeGeneric))
        continue;
      migrations.push(resolved);
    }

    return migrations;
  }

  protected buildExecutionPlan(options?: {
    fromVersion?: string;
    toVersion?: string;
    targetFlavour?: string;
    includeGeneric?: boolean;
  }): ResolvedMigration[] {
    const fromVersion = options?.fromVersion
      ? this.normalizeVersion(options.fromVersion)
      : undefined;
    const toVersion = options?.toVersion
      ? this.normalizeVersion(options.toVersion)
      : undefined;

    const migrations = this.sort(
      this.collectMigrations(options?.targetFlavour, options?.includeGeneric)
    );

    return migrations.filter((migration) => {
      if (fromVersion && !this.versioning.gt(migration.version, fromVersion))
        return false;
      if (toVersion && !this.versioning.lte(migration.version, toVersion))
        return false;
      return true;
    });
  }

  protected async executeMigration(
    migration: ResolvedMigration,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const m = migration.migration;
    let adapter: Adapter<any, any, any, any>;
    let qr: any;

    try {
      adapter = Adapter.get(migration.flavour) as any;
      if (!adapter)
        throw new InternalError(
          `failed to create migration ${m.reference}. did you call Service.boot() or use the Persistence Service??`
        );
      qr = adapter.client;
    } catch (e: unknown) {
      throw new InternalError(
        `Failed to load adapter to migrate ${m.reference}: ${e}`
      );
    }

    try {
      await m.up(qr, adapter, ...args);
    } catch (e: unknown) {
      throw new MigrationError(
        `failed to initialize migration ${m.reference}: ${e}`
      );
    }
    try {
      await m.migrate(qr, adapter, ...args);
    } catch (e: unknown) {
      throw new MigrationError(`failed to migrate ${m.reference}: ${e}`);
    }
    try {
      await m.down(qr, adapter, ...args);
    } catch (e: unknown) {
      throw new MigrationError(
        `failed to conclude migration ${m.reference}: ${e}`
      );
    }
  }

  protected buildMigrationTaskForPlan(
    plan: ResolvedMigration[],
    ...args: ContextualArgs<ContextOf<any>>
  ): TaskModel {
    const stepArgs = [...args];
    const builder = new MigrationTaskBuilder();
    plan.forEach((migration) => {
      const input: MigrationStepInput = {
        reference: migration.reference,
        args: stepArgs,
      };
      builder.addMigrationStep(input);
    });
    return builder.build();
  }

  protected buildMigrationTasksForPlan(
    plan: ResolvedMigration[],
    ...args: ContextualArgs<ContextOf<any>>
  ): VersionTask[] {
    const byVersion = new Map<string, ResolvedMigration[]>();
    for (const migration of plan) {
      const current = byVersion.get(migration.version) || [];
      current.push(migration);
      byVersion.set(migration.version, current);
    }

    return [...byVersion.entries()].map(([version, migrations]) => ({
      version,
      task: this.buildMigrationTaskForPlan(migrations, ...args),
    }));
  }

  createMigrationTask(
    targetVersion?: string,
    fromVersion?: string,
    ...args: ContextualArgs<ContextOf<any>>
  ): TaskModel {
    const cfg = this.config;
    const taskMode = cfg.taskMode ?? false;
    const includeGeneric = taskMode
      ? (cfg.includeGenericInTaskMode ?? true)
      : true;

    const plan = this.buildExecutionPlan({
      toVersion: targetVersion || cfg.targetVersion,
      fromVersion,
      targetFlavour: cfg.persistenceFlavour,
      includeGeneric,
    });

    return this.buildMigrationTaskForPlan(plan, ...args);
  }

  createMigrationTasks(
    targetVersion?: string,
    fromVersion?: string,
    ...args: ContextualArgs<ContextOf<any>>
  ): VersionTask[] {
    const cfg = this.config;
    const taskMode = cfg.taskMode ?? false;
    const includeGeneric = taskMode
      ? (cfg.includeGenericInTaskMode ?? true)
      : true;

    const plan = this.buildExecutionPlan({
      toVersion: targetVersion || cfg.targetVersion,
      fromVersion,
      targetFlavour: cfg.persistenceFlavour,
      includeGeneric,
    });

    return this.buildMigrationTasksForPlan(plan, ...args);
  }

  protected migrationTaskIdsFromContext(
    taskKey: string,
    args: ContextualArgs<ContextOf<any>>
  ): string[] {
    const last = args[args.length - 1] as any;
    const pending = last?.pending?.() || last?.pending || {};
    const values = pending?.[taskKey];
    if (!Array.isArray(values)) return [];
    return values.filter((value) => typeof value === "string");
  }

  async migrate(
    qr?: any,
    adapter?: any,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<R> {
    void qr;
    void adapter;

    if (this.config.taskMode)
      await this.migrateViaTasks(undefined, undefined, ...args);
    else await this.migrateNormally(undefined, undefined, ...args);

    return undefined as unknown as R;
  }

  async migrateNormally(
    qr?: any,
    adapter?: any,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<R> {
    const { ctxArgs, log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrateNormally);

    void qr;
    void adapter;

    const cfg = this.config;
    const targetFlavour = cfg.persistenceFlavour;
    const includeGeneric = cfg.taskMode
      ? (cfg.includeGenericInTaskMode ?? true)
      : true;

    const scopedAdapter = targetFlavour
      ? (Adapter.get(targetFlavour) as A)
      : undefined;

    let currentVersion: string | undefined;
    if (cfg.retrieveLastVersion && scopedAdapter) {
      const retrieved = await cfg.retrieveLastVersion(
        scopedAdapter,
        ...ctxArgs
      );
      if (retrieved) currentVersion = this.normalizeVersion(retrieved);
    }

    const plan = this.buildExecutionPlan({
      fromVersion: currentVersion,
      toVersion: cfg.targetVersion,
      targetFlavour,
      includeGeneric,
    });

    log.debug(
      `sorted migration before execution: ${plan.map((s) => `${s.reference}@${s.version}`)}`
    );

    for (const migration of plan) {
      await this.executeMigration(migration, ...ctxArgs);
    }

    if (cfg.setCurrentVersion && scopedAdapter) {
      const finalVersion =
        cfg.targetVersion ||
        plan[plan.length - 1]?.version ||
        currentVersion ||
        undefined;
      if (finalVersion)
        await cfg.setCurrentVersion(
          this.normalizeVersion(finalVersion),
          scopedAdapter,
          ...ctxArgs
        );
    }

    return undefined as unknown as R;
  }

  async migrateViaTasks(
    qr?: any,
    adapter?: any,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<R> {
    const { ctx, ctxArgs, log } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.migrateViaTasks);

    void qr;
    void adapter;

    const cfg = this.config;
    const targetFlavour = cfg.persistenceFlavour;
    const includeGeneric = cfg.includeGenericInTaskMode ?? true;

    const scopedAdapter = targetFlavour
      ? (Adapter.get(targetFlavour) as A)
      : undefined;

    let currentVersion: string | undefined;
    if (cfg.retrieveLastVersion && scopedAdapter) {
      const retrieved = await cfg.retrieveLastVersion(
        scopedAdapter,
        ...ctxArgs
      );
      if (retrieved) currentVersion = this.normalizeVersion(retrieved);
    }

    const plan = this.buildExecutionPlan({
      fromVersion: currentVersion,
      toVersion: cfg.targetVersion,
      targetFlavour,
      includeGeneric,
    });

    log.debug(
      `sorted migration before execution: ${plan.map((s) => `${s.reference}@${s.version}`)}`
    );

    this.queuedTaskChain = [];
    if (plan.length) {
      const tasks = this.buildMigrationTasksForPlan(plan, ...ctxArgs);
      if (cfg.taskService) {
        let dependsOnTaskId: string | undefined;
        for (const versionTask of tasks) {
          if (dependsOnTaskId) {
            versionTask.task.dependencies = [
              ...(versionTask.task.dependencies || []),
              dependsOnTaskId,
            ];
          }
          const created = await cfg.taskService.push(
            versionTask.task,
            false,
            ...ctxArgs
          );
          dependsOnTaskId = created.id;
          this.queuedTaskChain.push({
            id: created.id,
            version: versionTask.version,
          });
          if (!created?.id) {
            log.warn(
              `TaskService.push returned missing id for version ${versionTask.version}`
            );
          }
          ctx.pushPending(PersistenceKeys.MIGRATION, created.id);
        }
      } else {
        for (const migration of plan) {
          await this.executeMigration(migration, ...ctxArgs);
        }
        if (cfg.setCurrentVersion && scopedAdapter) {
          const finalVersion =
            cfg.targetVersion ||
            plan[plan.length - 1]?.version ||
            currentVersion ||
            undefined;
          if (finalVersion)
            await cfg.setCurrentVersion(
              this.normalizeVersion(finalVersion),
              scopedAdapter,
              ...ctxArgs
            );
        }
      }
    }

    return undefined as unknown as R;
  }

  async track(
    taskIds?: string[] | string,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<void> {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.track);

    const cfg = this.config;
    if (!cfg.taskService || !cfg.taskMode) return;

    const explicitTaskIds =
      typeof taskIds === "string"
        ? [taskIds]
        : Array.isArray(taskIds)
          ? taskIds
          : undefined;
    const queuedIds = this.queuedTaskChain.map((task) => task.id);
    const pendingIds = this.migrationTaskIdsFromContext(
      PersistenceKeys.MIGRATION,
      ctxArgs as any
    );
    const ids = explicitTaskIds?.length
      ? explicitTaskIds
      : queuedIds.length
        ? queuedIds
        : pendingIds;
    if (!ids.length) return;

    const versionByTaskId = this.queuedTaskChain.reduce(
      (acc, task) => {
        acc[task.id] = task.version;
        return acc;
      },
      {} as Record<string, string>
    );

    const scopedAdapter = this.config.persistenceFlavour
      ? (Adapter.get(this.config.persistenceFlavour) as A)
      : undefined;
    for (const id of ids) {
      const { tracker } = await cfg.taskService.track(id, ...ctxArgs);
      await tracker.wait();
      if (cfg.setCurrentVersion && scopedAdapter && versionByTaskId[id]) {
        await cfg.setCurrentVersion(
          this.normalizeVersion(versionByTaskId[id]),
          scopedAdapter,
          ...ctxArgs
        );
      }
    }
  }

  async retry(
    taskIds?: string[] | string,
    ...args: MaybeContextualArg<ContextOf<any>>
  ): Promise<void> {
    const { ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.MIGRATION, true)
    ).for(this.retry);

    const cfg = this.config;
    if (!cfg.taskMode || !cfg.taskService) {
      await this.migrateNormally(undefined, undefined, ...ctxArgs);
      return;
    }

    const explicitTaskIds =
      typeof taskIds === "string"
        ? [taskIds]
        : Array.isArray(taskIds)
          ? taskIds
          : undefined;
    const queuedIds = this.queuedTaskChain.map((task) => task.id);
    const pendingIds = this.migrationTaskIdsFromContext(
      PersistenceKeys.MIGRATION,
      ctxArgs as any
    );
    const ids = explicitTaskIds?.length
      ? explicitTaskIds
      : queuedIds.length
        ? queuedIds
        : pendingIds;
    if (!ids.length) {
      await this.migrateViaTasks(undefined, undefined, ...ctxArgs);
      return;
    }

    const taskRepo = (cfg.taskService.client as any).tasks;
    const updateRepo =
      typeof taskRepo?.override === "function"
        ? taskRepo.override({ ignoreHandlers: true })
        : taskRepo;
    for (const id of ids) {
      const tracked = await cfg.taskService.track(id, ...ctxArgs);
      const task = tracked.task;
      if (
        ![TaskStatus.FAILED, TaskStatus.CANCELED].includes(
          task.status as TaskStatus
        )
      )
        continue;
      const patched = new TaskModel({
        ...task,
        status: TaskStatus.PENDING,
        error: undefined,
        nextRunAt: undefined,
        scheduledTo: undefined,
        leaseOwner: undefined,
        leaseExpiry: undefined,
      });
      await updateRepo.update(patched, ...ctxArgs);
    }

    return;
  }

  async up(
    qr: any,
    adapter: any,
    ...args: ContextualArgs<ContextOf<any>>
  ): Promise<void> {
    const { log } = this.logCtx(args, this.down);
    log.verbose(style("Setting up migration process").yellow.bold);
    void qr;
    void adapter;
  }
}

const current =
  Metadata["innerGet"](Symbol.for(PersistenceKeys.MIGRATION), DefaultFlavour) ||
  [];

Metadata.set(PersistenceKeys.MIGRATION, DefaultFlavour, [
  ...current,
  MigrationService,
]);
