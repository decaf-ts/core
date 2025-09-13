import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter } from "./Adapter";

/**
 * @description Type representing possible ID formats for database events
 * @summary A union type that defines the possible formats for event identifiers in the persistence layer.
 * These can be single values (string, number, bigint) or arrays of these types.
 * @typedef {(string|number|bigint|string[]|number[]|bigint[])} EventIds
 * @memberOf module:core
 */
export type EventIds =
  | string
  | number
  | bigint
  | string[]
  | number[]
  | bigint[];

/**
 * @description Function type for filtering observer notifications
 * @summary A function type that defines a predicate used to determine whether an observer should be notified
 * about a specific database event. The filter examines the table name, event type, and affected IDs.
 * @param {string} table - The name of the database table where the event occurred
 * @param {(OperationKeys|BulkCrudOperationKeys|string)} event - The type of operation that triggered the event
 * @param {EventIds} id - The identifier(s) of the affected record(s)
 * @return {boolean} True if the observer should be notified, false otherwise
 * @typedef {Function} ObserverFilter
 * @memberOf module:core
 */
export type ObserverFilter = (
  table: string,
  event: OperationKeys | BulkCrudOperationKeys | string,
  id: EventIds
) => boolean;

export type InferredAdapterConfig<A> =
  A extends Adapter<infer CONF, any, any, any> ? CONF : never;
