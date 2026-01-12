import { Context as Ctx, ContextFlags } from "@decaf-ts/db-decorators";
import { AdapterFlags } from "./types";

export class Context<
  F extends ContextFlags<any> = AdapterFlags<any>,
> extends Ctx<F> {
  constructor(ctx?: Context<any>) {
    super(ctx as Ctx<any>);
  }
}
