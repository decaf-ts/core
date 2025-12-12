import { Context as Ctx } from "@decaf-ts/db-decorators";
import { AdapterFlags, FlagsOf } from "./types";
import { OperationKeys } from "@decaf-ts/db-decorators/lib/esm/operations/constants";
import { Constructor } from "@decaf-ts/decoration";
import { Contextual } from "@decaf-ts/db-decorators/";
import { ContextArgs } from "@decaf-ts/db-decorators";
import { Model } from "@decaf-ts/decorator-validation";

export class Context<F extends AdapterFlags = AdapterFlags> extends Ctx<F> {
  constructor() {
    super();
  }

  static override args<M extends Model<any>, C extends Context<any>>(
    operation:
      | OperationKeys.CREATE
      | OperationKeys.READ
      | OperationKeys.UPDATE
      | OperationKeys.DELETE
      | string,
    model: Constructor<M>,
    args: any[],
    contextual?: Contextual<C>,
    overrides?: Partial<FlagsOf<C>>
  ): Promise<ContextArgs<C>> {
    return super.args<M, C>(operation, model, args, contextual, overrides);
  }
}
