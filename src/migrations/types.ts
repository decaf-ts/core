import { Adapter } from "../persistence/Adapter";

import { AdapterFlags, ContextOf } from "../persistence/types";
import { ContextualArgs } from "../utils/ContextualLoggedClass";
export interface Migration<QUERYRUNNER, A extends Adapter<any, any, any, any>> {
  flavour?: string;
  precedence: Migration<any, any> | Migration<any, any>[] | null;
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
  ): Promise<void>;
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
  precedence?: Migration<any, any>;
  flavour: string;
  rules?: MigrationRule[];
};

export type MigrationConfig<PERSIST extends boolean> = AdapterFlags<any> & {
  persistMigrationSteps: PERSIST;
  persistenceFlavour?: string;
};
