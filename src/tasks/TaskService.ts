import { MaybeContextualArg } from "../utils/ContextualLoggedClass";
import { ClientBasedService } from "../services/services";
import { TaskEngine, TaskEngineConfig } from "./TaskEngine";
import { Adapter, ContextOf, PersistenceKeys } from "../persistence/index";
import { InternalError } from "@decaf-ts/db-decorators";

export class TaskService<
  A extends Adapter<any, any, any, any>,
> extends ClientBasedService<TaskEngine<A>, TaskEngineConfig<A>> {
  constructor() {
    super();
  }

  override async initialize(
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<{ config: TaskEngineConfig<A>; client: TaskEngine<A> }> {
    const { log } = (
      await this.logCtx(args, PersistenceKeys.INITIALIZATION, true)
    ).for(this.initialize);
    const cfg = args.pop() as TaskEngineConfig<A> | any;
    if (!cfg.adapter) throw new InternalError(`No adapter provided`);
    log.info(`Initializing Task Engine...`);
    const client: TaskEngine<A> = new TaskEngine(cfg);
    log.verbose(`${client} initialized`);
    return {
      client: client,
      config: cfg,
    };
  }
}
