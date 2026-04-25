import { Adapter } from "../persistence/Adapter";

import { AdapterFlags, ContextOf } from "../persistence/types";
import { ContextualArgs } from "../utils/ContextualLoggedClass";
import { TaskService } from "../tasks/TaskService";
import type { MigrationVersioning } from "./MigrationVersioning";
export interface Migration<
  QUERYRUNNER,
  A extends Adapter<any, any, any, any>,
  R = void,
> {
  flavour?: string;
  precedence:
    | Migration<any, any>
    | Migration<any, any>[]
    | string
    | null;
  reference: string;
  transaction: boolean;
  up(
    qr: QUERYRUNNER,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;
  migrate(
    qr: QUERYRUNNER,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<R>;
  down(
    qr: QUERYRUNNER,
    adapter: A,
    ...args: ContextualArgs<ContextOf<A>>
  ): Promise<void>;
}

export type ConnectionForAdapter<A extends Adapter<any, any, any, any>> =
  A extends Adapter<any, any, infer CONN, any> ? CONN : never;

export type MigrationRule<
  A extends Adapter<any, any, any, any> = any,
  QUERYRUNNER = ConnectionForAdapter<A>,
> = (qr: QUERYRUNNER, adapter: A, ctx: ContextOf<A>) => Promise<boolean>;

export type MigrationMetadata = {
  precedence?: Migration<any, any> | string;
  flavour: string;
  rules?: MigrationRule[];
};

export type RetrieveLastVersionHandler<
  A extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
> = (
  adapter: A,
  ...args: ContextualArgs<ContextOf<A>>
) => Promise<string | undefined | null>;

export type SetCurrentVersionHandler<
  A extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
> = (
  version: string,
  adapter: A,
  ...args: ContextualArgs<ContextOf<A>>
) => Promise<void>;

export type AdapterMigrationHandlers<
  AD extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
> = {
  retrieveLastVersion?: RetrieveLastVersionHandler<AD>;
  setCurrentVersion?: SetCurrentVersionHandler<AD>;
};

export type PersistenceMigrationConfig<
  AD extends Adapter<any, any, any, any> = Adapter<any, any, any, any>,
> = {
  toVersion?: string;
  taskMode?: boolean;
  dryRun?: boolean;
  flavours?: string[];
  taskService?: TaskService<any>;
  handlers?: Partial<Record<string, AdapterMigrationHandlers<AD>>>;
};

export type MigrationConfig<PERSIST extends boolean> = AdapterFlags<any> & {
  persistMigrationSteps: PERSIST;
  persistenceFlavour?: string;
  targetVersion?: string;
  taskMode?: boolean;
  includeGenericInTaskMode?: boolean;
  retrieveLastVersion?: RetrieveLastVersionHandler;
  setCurrentVersion?: SetCurrentVersionHandler;
  taskService?: TaskService<any>;
  versioning?: MigrationVersioning;
};
