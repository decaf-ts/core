import { Context } from "@decaf-ts/db-decorators";
import { RamFlags } from "./types";

export class RamContext extends Context<RamFlags> {
  constructor(obj: RamFlags) {
    super(obj);
  }
}
