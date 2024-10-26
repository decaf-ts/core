import { list, model, Model, ModelArg } from "@decaf-ts/decorator-validation";
import { Roles } from "../persistence/constants";
import { pk } from "../identity/decorators";

@model()
export class User extends Model {
  @pk()
  id!: string;

  @list([String])
  roles?: (string | Roles)[];

  @list([String])
  affiliations?: string[];

  constructor(arg?: ModelArg<User>) {
    super(arg);
  }
}
