import { InternalError } from "@decaf-ts/db-decorators";

/**
 * @description Error thrown when an unsupported operation is attempted
 * @summary This error is thrown when an operation is requested that is not supported by the current
 * persistence adapter or configuration. It extends the BaseError class and sets a 500 status code.
 * @param {string|Error} msg - The error message or an Error object to wrap
 * @class UnsupportedError
 * @example
 * ```typescript
 * // Throwing an UnsupportedError
 * if (!adapter.supportsTransactions()) {
 *   throw new UnsupportedError('Transactions are not supported by this adapter');
 * }
 *
 * // Catching an UnsupportedError
 * try {
 *   await adapter.beginTransaction();
 * } catch (error) {
 *   if (error instanceof UnsupportedError) {
 *     console.error('Operation not supported:', error.message);
 *   }
 * }
 * ```
 */
export class UnsupportedError extends InternalError {
  constructor(msg: string | Error | unknown) {
    super(msg, UnsupportedError.name, 500);
  }
}

export class MigrationError extends InternalError {
  constructor(msg: string | Error | unknown, name = MigrationError.name) {
    super(msg, name, 500);
  }
}

export class MigrationRuleError extends MigrationError {
  constructor(msg: string | Error | unknown) {
    super(msg, MigrationRuleError.name);
  }
}
