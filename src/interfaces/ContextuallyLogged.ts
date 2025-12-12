import { LoggerOf } from "../persistence/index";
import { Context } from "@decaf-ts/db-decorators";

export interface ContextuallyLogged<C extends Context<any>> {
  logAndCtx(
    args: any[],
    method?: (...args: any[]) => any
  ): { ctx: C; log: LoggerOf<C> };
}
