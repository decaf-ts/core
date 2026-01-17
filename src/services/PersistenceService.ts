import { ClientBasedService } from "./services";
import { Adapter } from "../persistence/Adapter";
import { ConfigOf, ContextOf } from "../persistence/types";
import { MaybeContextualArg } from "../utils/ContextualLoggedClass";
import { Context } from "../persistence/Context";
import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";
import { PersistenceKeys } from "../persistence/constants";

export class PersistenceService<
  A extends Adapter<any, any, any, any>,
> extends ClientBasedService<
  A[],
  [Constructor<A>, ConfigOf<A>, ...args: any[]][],
  ContextOf<A>
> {
  constructor() {
    super();
  }

  override async initialize(
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<{
    config: [Constructor<A>, ConfigOf<A>, ...args: any[]][];
    client: A[];
  }> {
    const cfgs: [Constructor<A>, ConfigOf<A>, ...args: any[]][] = args.shift();
    if (
      !cfgs ||
      !Array.isArray(cfgs) ||
      cfgs instanceof Context ||
      !cfgs.every((c) => Array.isArray(c))
    )
      throw new InternalError(`Missing/invalid configuration`);
    const { log, ctxArgs } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    const clients: A[] = cfgs.map(([constr, cfg, ...args]) => {
      try {
        log.silly(
          `Initializing ${constr.name} with config: ${JSON.stringify(cfg)}`
        );
        const adapter = new constr(cfg, ...args) as A;
        log.debug(`Initialized ${adapter.toString()}...`);
        return adapter;
      } catch (e: unknown) {
        throw new InternalError(`Failed to initialize ${constr.name}: ${e}`);
      }
    });

    for (const c of clients) {
      try {
        await c.initialize(...ctxArgs);
      } catch (e: any) {
        throw new InternalError(`Failed to initialize ${c.toString()}: ${e}`);
      }
    }

    return {
      client: clients,
      config: cfgs,
    };
  }
}
