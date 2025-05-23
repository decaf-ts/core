import { BaseError } from "@decaf-ts/db-decorators";

export class AuthorizationError extends BaseError {
  constructor(msg: string | Error) {
    super(AuthorizationError.name, msg, 401);
  }
}

export class ForbiddenError extends BaseError {
  constructor(msg: string | Error) {
    super(ForbiddenError.name, msg, 403);
  }
}

export class ConnectionError extends BaseError {
  constructor(msg: string | Error) {
    super(ConnectionError.name, msg, 503);
  }
}
