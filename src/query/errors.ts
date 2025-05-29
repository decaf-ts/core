import { BaseError } from "@decaf-ts/db-decorators";

/**
 * @description Error thrown during query operations
 * @summary Represents errors that occur during query building or execution
 * @param {string | Error} msg - The error message or Error object
 * @class QueryError
 * @category Errors
 */
export class QueryError extends BaseError {
  constructor(msg: string | Error) {
    super(QueryError.name, msg, 500);
  }
}

/**
 * @description Error thrown during pagination operations
 * @summary Represents errors that occur during pagination setup or execution
 * @param {string | Error} msg - The error message or Error object
 * @class PagingError
 * @category Errors
 */
export class PagingError extends BaseError {
  constructor(msg: string | Error) {
    super(PagingError.name, msg, 500);
  }
}
