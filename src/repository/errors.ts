import { BaseError } from "@decaf-ts/db-decorators";

/**
 * @summary Represents a failure in observer communication
 *
 * @param {string} msg the error message
 *
 * @class ObserverError
 * @extends BaseError
 */
export class ObserverError extends BaseError {
  constructor(msg: string | Error) {
    super(ObserverError.name, msg, 500);
  }
}

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
