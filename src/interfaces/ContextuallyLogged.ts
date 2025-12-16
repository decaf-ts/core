import { Context } from "../persistence/Context";
import { LoggerOf } from "../persistence/types";

export interface ContextuallyLogged<C extends Context<any>> {
  logAndCtx(
    args: any[],
    method?: (...args: any[]) => any
  ): { ctx: C; log: LoggerOf<C> };
}
