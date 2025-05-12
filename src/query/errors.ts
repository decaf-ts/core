import { BaseError } from "@decaf-ts/db-decorators";

export class QueryError extends BaseError {
  constructor(msg: string | Error) {
    super(QueryError.name, msg, 500);
  }
}

export class PagingError extends BaseError {
  constructor(msg: string | Error) {
    super(PagingError.name, msg, 500);
  }
}
