import { ClientBasedService, MaybeContextualArg } from "../utils/index";
import { TaskEngine, TaskEngineConfig } from "./TaskEngine";
import { Adapter, ContextOf } from "../persistence/index";
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
    const { log } = await this.logCtx(args, this.initialize, true);
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
