import { InternalError } from "@decaf-ts/db-decorators";

/**
 * @description Error thrown when observer communication fails.
 * @summary Represents a failure in observer communication between repositories.
 * @param {string|Error} msg - The error message or Error object.
 * @class ObserverError
 * @category Errors
 * @example
 * try {
 *   // Some repository observer operation
 * } catch (error) {
 *   if (error instanceof ObserverError) {
 *     console.error('Observer communication failed:', error.message);
 *   }
 * }
 */
export class ObserverError extends InternalError {
  constructor(msg: string | Error) {
    super(msg, ObserverError.name, 500);
  }
}
