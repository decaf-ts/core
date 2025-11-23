import { Context } from "@decaf-ts/db-decorators";
import { LoggerOf } from "../persistence/index";

export interface ContextuallyLogged<C extends Context<any>> {
  logAndCtx(
    args: any[],
    method?: (...args: any[]) => any
  ): { ctx: C; log: LoggerOf<C> };
}
