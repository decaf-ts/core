import { PersistenceKeys } from "./constants";
import { Model, required } from "@decaf-ts/decorator-validation";
import { generated, onCreateUpdate, readonly } from "@decaf-ts/db-decorators";
import { apply, Decoration } from "@decaf-ts/decoration";
import { ContextOfRepository } from "./types";
import { Repository } from "../repository/Repository";

/**
 * @description Handler function that sets a timestamp property to the current timestamp.
 * @summary Updates a model property with the current timestamp from the repository context.
 * @template M - The model type extending Model
 * @template R - The repository type extending IRepository
 * @template V - The data type for the operation
 * @template F - The repository flags type
 * @template C - The context type
 * @param {C} context - The repository context containing the current timestamp
 * @param {V} data - The data being processed
 * @param key - The property key to update
 * @param {M} model - The model instance being updated
 * @return {Promise<void>} A promise that resolves when the timestamp has been set
 * @function uuidCreateUpdateHandler
 */
export async function uuidCreateUpdateHandler<
  M extends Model,
  R extends Repository<M, any>,
  V,
>(
  this: R,
  context: ContextOfRepository<R>,
  data: V,
  key: keyof M,
  model: M
): Promise<void> {
  if (
    context.get("allowGenerationOverride") &&
    typeof model[key] === "undefined"
  ) {
    return;
  }
  (model as any)[key] = context.timestamp;
}

/**
 * @description Automatically manages timestamp properties for tracking creation and update times.
 * @summary Marks the property as a timestamp, making it required and ensuring it's a valid date. The property will be automatically updated with the current timestamp during specified operations.
 *
 * Date Format:
 *
 * <pre>
 *      Using similar formatting as Moment.js, Class DateTimeFormatter (Java), and Class SimpleDateFormat (Java),
 *      I implemented a comprehensive solution formatDate(date, patternStr) where the code is easy to read and modify.
 *      You can display date, time, AM/PM, etc.
 *
 *      Date and Time Patterns
 *      yy = 2-digit year; yyyy = full year
 *      M = digit month; MM = 2-digit month; MMM = short month name; MMMM = full month name
 *      EEEE = full weekday name; EEE = short weekday name
 *      d = digit day; dd = 2-digit day
 *      h = hours am/pm; hh = 2-digit hours am/pm; H = hours; HH = 2-digit hours
 *      m = minutes; mm = 2-digit minutes; aaa = AM/PM
 *      s = seconds; ss = 2-digit seconds
 *      S = miliseconds
 * </pre>
 *
 * @param {OperationKeys[]} operation - The operations to act on. Defaults to {@link DBOperations.CREATE_UPDATE}
 * @param {string} [format] - The timestamp format. Defaults to {@link DEFAULT_TIMESTAMP_FORMAT}
 * @return {PropertyDecorator} A decorator function that can be applied to class properties
 * @function timestamp
 * @category Property Decorators
 * @mermaid
 * sequenceDiagram
 *   participant C as Client
 *   participant M as Model
 *   participant T as TimestampDecorator
 *   participant V as Validator
 *
 *   C->>M: Create/Update model
 *   M->>T: Process timestamp property
 *   T->>M: Apply required validation
 *   T->>M: Apply date format validation
 *
 *   alt Update operation
 *     T->>V: Register timestamp validator
 *     V->>M: Validate timestamp is newer
 *   end
 *
 *   T->>M: Set current timestamp
 *   M->>C: Return updated model
 */
export function uuid(onUpdate: boolean = true) {
  const decorationKey = PersistenceKeys.UUID;

  function uuid(onUpdate: boolean = true) {
    const meta = { onUpdate: true };
    const decorators: any[] = [
      required(),
      generated(PersistenceKeys.UUID),
      onCreateUpdate(uuidCreateUpdateHandler, meta),
    ];
    if (!onUpdate) decorators.push(readonly());
    return apply(...decorators);
  }

  return Decoration.for(decorationKey)
    .define({
      decorator: uuid,
      args: [onUpdate],
    })
    .apply();
}
