import { Dispatch } from "../persistence/Dispatch";
import type { Adapter } from "../persistence/Adapter";
import { ContextOf } from "../persistence/types";
import { MaybeContextualArg } from "../utils/ContextualLoggedClass";

export class FsDispatch<
  A extends Adapter<any, any, any, any> = Adapter<any, any, any, any>
> extends Dispatch<A> {
  protected override async initialize(
    ...args: MaybeContextualArg<ContextOf<A>>
  ): Promise<void> {
    await super.initialize(...args);
    if (!this.adapter) return;
    const ensureWatching = (this.adapter as any)["ensureWatching"];
    if (typeof ensureWatching !== "function") return;
    try {
      await ensureWatching.call(this.adapter);
    } catch (error) {
      this.log
        .for(this.initialize)
        .error(`Failed to enable filesystem watchers: ${error}`);
    }
  }
}
