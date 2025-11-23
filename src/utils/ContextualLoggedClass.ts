import { LoggedClass } from "@decaf-ts/logging";
import { Context } from "@decaf-ts/db-decorators";
import { LoggerOf } from "../persistence/index";

export abstract class ContextualLoggedClass<C extends Context<any>> extends LoggedClass {

  protected abstract logFor(ctx: C, ...args: any[]): LoggerOf<C>
}