import { Context as Ctx, ContextFlags } from "@decaf-ts/db-decorators";
import { AdapterFlags } from "./types";
import { Lock } from "@decaf-ts/transactional-decorators";

export class ContextLock extends Lock {
  constructor() {
    super();
  }
}

export class Context<
  F extends ContextFlags<any> = AdapterFlags<any>,
> extends Ctx<F> {
  constructor(ctx?: Context<any>) {
    super(ctx as Ctx<any>);
  }
}
