import {
  DEFAULT_ERROR_MESSAGES,
  propMetadata,
  Validation,
  ValidationKeys,
  ValidationMetadata,
} from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "../persistence";

Object.defineProperty(DEFAULT_ERROR_MESSAGES, PersistenceKeys.CLAUSE_SEQUENCE, {
  value: "Invalid clause sequence: {0}",
});

Object.defineProperty(ValidationKeys, "CLAUSE_SEQUENCE", {
  value: PersistenceKeys.CLAUSE_SEQUENCE,
});

/**
 *
 * @param {string} [message]
 *
 * @function clauseSequence
 *
 * @category Decorators
 * @subcategory Validation
 */
export function clauseSequence(message?: string) {
  return propMetadata<ValidationMetadata>(
    Validation.key(ValidationKeys.REQUIRED),
    {
      message:
        message ||
        ((DEFAULT_ERROR_MESSAGES as any)[
          PersistenceKeys.CLAUSE_SEQUENCE as any
        ] as string),
    }
  );
}
