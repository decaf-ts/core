import {
  DEFAULT_ERROR_MESSAGES,
  sf,
  validator,
  Validator,
  ValidatorOptions,
} from "@decaf-ts/decorator-validation";
import { isEqual } from "@decaf-ts/reflection";
import { Clause } from "../query/Clause";
import { MandatoryPriorities } from "../query/constants";
import { QueryError } from "../query/errors";
import { PersistenceKeys } from "../persistence/constants";

/**
 * @summary Validates a {@link Sequence}'s {@link Clause}s
 *
 * @param {string} [message]
 *
 * @class ClauseSequenceValidator
 * @extends Validator
 *
 * @category Validation
 * @subcategory Validators
 */
@validator(PersistenceKeys.CLAUSE_SEQUENCE)
export class ClauseSequenceValidator extends Validator {
  constructor(
    message: string = DEFAULT_ERROR_MESSAGES[PersistenceKeys.CLAUSE_SEQUENCE]
  ) {
    super(message);
  }

  private validateSequence(
    clauses: Clause<any>[],
    message?: string
  ): string | undefined {
    return MandatoryPriorities.every(
      (p) => !!clauses.find((c) => c.getPriority() === p)
    )
      ? undefined
      : this.getMessage(
          sf(message || this.message, "Missing required Clause Priorities")
        );
  }

  /**
   * @summary Verifies the model for errors
   * @param {string} value
   * @param {ValidatorOptions} [options]
   *
   * @return Errors
   *
   * @override
   *
   * @see Validator
   */
  public hasErrors(value: any, options?: ValidatorOptions): string | undefined {
    try {
      if (
        !value ||
        !Array.isArray(value) ||
        !value.length ||
        !value.every((e) => e instanceof Clause)
      )
        return this.getMessage(
          sf(
            (options || {}).message || this.message,
            "No or invalid Clauses found"
          )
        );

      const clauses: Clause<any>[] = value as Clause<any>[];

      const clauseErrors = clauses.reduce(
        (accum: string | undefined, c: Clause<any>) => {
          const errs = c.hasErrors();
          if (errs)
            if (accum)
              accum += sf(
                "\nClause {0}: {1}",
                c.constructor.name,
                errs.toString()
              );
            else
              accum = sf(
                "Clause {0}: {1}",
                c.constructor.name,
                errs.toString()
              );
          return accum;
        },
        undefined
      );

      if (clauseErrors)
        return this.getMessage(
          sf((options || {}).message || this.message, clauseErrors.toString())
        );

      const verifyPriority = () => {
        const priorities = clauses.map((c) => c.getPriority());
        const allUnique = new Set(priorities).size === priorities.length;
        if (!allUnique) return "Not all clauses  have unique priorities";
        const sorted = priorities.sort((a, b) => {
          return b - a;
        });

        return isEqual(priorities, sorted)
          ? true
          : "Clauses  are not properly sorted";
      };

      const priorityCheck = verifyPriority();
      if (priorityCheck !== true)
        return this.getMessage(
          sf((options || {}).message || this.message, "Invalid prioritization")
        );

      const sequenceCheck = this.validateSequence(
        clauses,
        (options || {}).message
      );
      if (sequenceCheck)
        return this.getMessage(
          sf((options || {}).message || this.message, "Invalid sequence")
        );
    } catch (e: any) {
      throw new QueryError(
        sf("Failed to verify clause sequence {0}: {1}", value, e)
      );
    }
  }
}
