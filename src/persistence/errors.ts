import { BaseError } from "@decaf-ts/db-decorators";

export class UnsupportedError extends BaseError {
  constructor(msg: string | Error) {
    super(UnsupportedError.name, msg, 500);
  }
}
