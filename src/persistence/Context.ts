import { Context as Ctx } from "@decaf-ts/db-decorators";
import { AdapterFlags } from "./types";

export class Context<F extends AdapterFlags = AdapterFlags> extends Ctx<F> {
  constructor() {
    super();
  }
}
