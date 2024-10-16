import { BaseError } from "@decaf-ts/db-decorators";

export class ConnectionError extends BaseError {
  constructor(msg: string | Error) {
    super(ConnectionError.name, msg);
  }
}
