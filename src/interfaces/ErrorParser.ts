import { BaseError } from "@decaf-ts/db-decorators";

export interface ErrorParser {
  parseError(error: Error): BaseError;
}
