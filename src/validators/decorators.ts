import {
  DEFAULT_ERROR_MESSAGES,
  getValidationKey,
  ValidationKeys,
  ValidationMetadata,
} from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "../persistence";
import { metadata } from "@decaf-ts/reflection";

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
  return metadata<ValidationMetadata>(
    getValidationKey(ValidationKeys.REQUIRED),
    {
      message:
        message ||
        ((DEFAULT_ERROR_MESSAGES as any)[
          PersistenceKeys.CLAUSE_SEQUENCE as any
        ] as string),
    },
  );
}
