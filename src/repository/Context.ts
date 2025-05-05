import { Context as Ctx, RepositoryFlags } from "@decaf-ts/db-decorators";
import { User } from "../model";

export abstract class Context<
  F extends RepositoryFlags,
  U extends User = User,
> extends Ctx<F> {
  protected constructor(obj: F) {
    super(obj);
  }

  abstract get user(): U | undefined;
}
