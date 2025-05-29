import { BaseError } from "@decaf-ts/db-decorators";

/**
 * @description Interface for parsing errors
 * @summary Defines a contract for objects that can parse generic Error objects into BaseError instances
 * @interface ErrorParser
 * @memberOf module:core
 */
export interface ErrorParser {
  /**
   * @description Parses a generic Error into a BaseError
   * @summary Converts a standard Error object into a more specific BaseError type
   * @param {Error} error - The error to be parsed
   * @return {BaseError} The parsed error as a BaseError instance
   */
  parseError(error: Error): BaseError;
}
