import { BaseError } from "@decaf-ts/db-decorators";

/**
 * @description Error thrown when a user is not authorized to perform an action
 * @summary This error is thrown when a user attempts to access a resource or perform an action without proper authentication
 * @param {string|Error} msg - The error message or Error object
 * @class AuthorizationError
 * @category Errors
 * @example
 * ```typescript
 * // Example of throwing an AuthorizationError
 * if (!user.isAuthenticated()) {
 *   throw new AuthorizationError('User not authenticated');
 * }
 * ```
 */
export class AuthorizationError extends BaseError {
  constructor(msg: string | Error) {
    super(AuthorizationError.name, msg, 401);
  }
}

/**
 * @description Error thrown when a user is forbidden from accessing a resource
 * @summary This error is thrown when an authenticated user attempts to access a resource or perform an action they don't have permission for
 * @param {string|Error} msg - The error message or Error object
 * @return {void}
 * @class ForbiddenError
 * @category Errors
 * @example
 * ```typescript
 * // Example of throwing a ForbiddenError
 * if (!user.hasPermission('admin')) {
 *   throw new ForbiddenError('User does not have admin permissions');
 * }
 * ```
 */
export class ForbiddenError extends BaseError {
  constructor(msg: string | Error) {
    super(ForbiddenError.name, msg, 403);
  }
}

/**
 * @description Error thrown when a connection to a service fails
 * @summary This error is thrown when the application fails to establish a connection to a required service or resource
 * @param {string|Error} msg - The error message or Error object
 * @return {void}
 * @class ConnectionError
 * @category Errors
 * @example
 * ```typescript
 * // Example of throwing a ConnectionError
 * try {
 *   await database.connect();
 * } catch (error) {
 *   throw new ConnectionError('Failed to connect to database');
 * }
 * ```
 */
export class ConnectionError extends BaseError {
  constructor(msg: string | Error) {
    super(ConnectionError.name, msg, 503);
  }
}
