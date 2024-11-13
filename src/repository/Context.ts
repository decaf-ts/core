import { Context as Ctx } from "@decaf-ts/db-decorators";
import { Constructor, Model } from "@decaf-ts/decorator-validation";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { User } from "../model";

export abstract class Context<
  M extends Model,
  U extends User = User,
> extends Ctx<M> {
  protected _timestamp!: Date;

  protected constructor(
    operation: OperationKeys,
    model?: Constructor<M>,
    parent?: Context<any, any>
  ) {
    super(operation, model, parent);
  }

  override get timestamp() {
    if (!this._timestamp) this._timestamp = new Date();
    return this._timestamp;
  }

  abstract get user(): U | undefined;
}
