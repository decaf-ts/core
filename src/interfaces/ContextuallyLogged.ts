import { LoggerOf } from "../persistence/types";
import { Context } from "../persistence/Context";

export interface ContextuallyLogged<C extends Context<any>> {
  logAndCtx(
    args: any[],
    method?: (...args: any[]) => any
  ): { ctx: C; log: LoggerOf<C> };
}
