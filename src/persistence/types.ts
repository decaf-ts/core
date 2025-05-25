import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";

export type EventIds =
  | string
  | number
  | bigint
  | string[]
  | number[]
  | bigint[];

export type ObserverFilter = (
  table: string,
  event: OperationKeys | BulkCrudOperationKeys | string,
  id: EventIds
) => boolean;
