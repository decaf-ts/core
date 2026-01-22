import { ITaskHandler } from "./types";
import { TasksKey } from "./constants";
import { Metadata } from "@decaf-ts/decoration";
import { InternalError, wrapMethodWithContext } from "@decaf-ts/db-decorators";
import { AbsContextual, ContextualArgs } from "../utils/ContextualLoggedClass";
import { TaskContext } from "./TaskContext";

export abstract class TaskHandler<I, O>
  extends AbsContextual<TaskContext>
  implements ITaskHandler<I, O>
{
  private _type?: string;

  get type() {
    if (!this._type) {
      const meta = Metadata.get(this.constructor as any, TasksKey);
      if (typeof meta === "string") {
        this._type = meta;
      } else if (meta && typeof meta.type === "string") {
        this._type = meta.type;
      }
    }
    if (!this._type)
      throw new InternalError(
        `No type annotation for this handler found. did you use @task()?`
      );
    return this._type;
  }

  protected constructor() {
    super();
    wrapMethodWithContext(
      this,
      this.runPrefix.bind(this),
      this.run.bind(this),
      this.runSuffix.bind(this),
      this.run.name
    );
  }

  protected async runPrefix(input: I, ...args: ContextualArgs<TaskContext>) {
    const { log, ctx, ctxArgs } = this.logCtx(args, this.runPrefix);
    log.info(`Running task ${ctx.taskId} attempt ${ctx.attempt}`);
    return [input, ...ctxArgs];
  }

  protected runSuffix(output: O, ctx: TaskContext) {
    const { log } = this.logCtx([ctx], this.runPrefix);
    log.info(`Concluded task ${ctx.taskId} attempt ${ctx.attempt}`);
    return output;
  }

  abstract run(input: I, ctx: TaskContext): Promise<O>;
}
