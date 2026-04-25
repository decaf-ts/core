import {
  Constructor,
  Decoration,
  DefaultFlavour,
  metadata,
  Metadata,
} from "@decaf-ts/decoration";
import { Migration, MigrationRule } from "./types";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationService } from "./MigrationService";

export function migration(reference: string): (target: object) => any;
export function migration(
  reference: string,
  precedence: Constructor<Migration<any, any>> | null
): (target: object) => any;
export function migration(
  reference: string,
  flavour: string,
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
  reference: string,
  precedence: Constructor<Migration<any, any>>,
  flavour: string
): (target: object) => any;
export function migration(
  reference: string,
  precedence?: Constructor<Migration<any, any>> | string | null,
  flavour?: string | MigrationRule[],
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
  reference: string,
  opts?: {
    precedence?: Constructor<Migration<any, any>> | string | null;
    flavour?: string;
    rules?: MigrationRule[];
  }
): (target: object) => any;
export function migration(
  reference: string,
  precedence?:
    | Constructor<Migration<any, any>>
    | string
    | null
    | {
        precedence?: Constructor<Migration<any, any>> | string | null;
        flavour?: string;
        rules?: MigrationRule[];
      },
  flavour?: string | MigrationRule[],
  rules?: MigrationRule[]
): (target: object) => any {
  function innerMigration(
    precedence?:
      | Constructor<Migration<any, any>>
      | string
      | null
      | {
          precedence?: Constructor<Migration<any, any>> | string | null;
          flavour?: string;
          rules?: MigrationRule[];
        },
    flavour?: string | MigrationRule[],
    rules?: MigrationRule[]
  ): (original: object) => void {
    return function (original: object) {
      const fromOptions =
        precedence && typeof precedence === "object" && !("name" in precedence)
          ? precedence
          : undefined;
      const explicitPrecedence = fromOptions?.precedence;
      const explicitFlavour = fromOptions?.flavour;
      const explicitRules = fromOptions?.rules;
      const normalizedPrecedence = fromOptions
        ? explicitPrecedence
        : precedence;
      const normalizedFlavour = fromOptions ? explicitFlavour : flavour;
      const normalizedRules = fromOptions ? explicitRules : rules;
      const positionalStringIsPrecedence =
        typeof normalizedPrecedence === "string" &&
        typeof normalizedFlavour === "string";
      const hasExplicitPrecedence = fromOptions
        ? typeof explicitPrecedence !== "undefined"
        : typeof normalizedPrecedence !== "undefined" &&
          (typeof normalizedPrecedence !== "string" ||
            positionalStringIsPrecedence);

      let parsedPrecedence:
        | Constructor<Migration<any, any>>
        | string
        | null
        | undefined = normalizedPrecedence as any;
      let parsedFlavour: string | undefined;
      let parsedRules: MigrationRule[] | undefined;

      if (typeof normalizedPrecedence === "string") {
        if (typeof normalizedFlavour === "string") {
          parsedPrecedence = normalizedPrecedence;
          parsedFlavour = normalizedFlavour;
          parsedRules = normalizedRules;
        } else if (Array.isArray(normalizedFlavour as any)) {
          // Legacy overload support: @migration(reference, flavour, rules)
          parsedPrecedence = undefined;
          parsedFlavour = normalizedPrecedence;
          parsedRules = normalizedFlavour as MigrationRule[];
        } else {
          // Legacy overload support: @migration(reference, flavour)
          parsedPrecedence = undefined;
          parsedFlavour = normalizedPrecedence;
          parsedRules = normalizedRules;
        }
      } else if (Array.isArray(normalizedFlavour as any)) {
        parsedRules = normalizedFlavour as MigrationRule[];
      } else {
        parsedFlavour = normalizedFlavour as string | undefined;
        parsedRules = normalizedRules;
      }

      if (parsedPrecedence === undefined && parsedPrecedence !== null)
        parsedPrecedence = MigrationService;

      const fallbackFlavour =
        Metadata.flavourOf(original as Constructor) || DefaultFlavour;
      const preferReferenceFlavour =
        hasExplicitPrecedence &&
        parsedPrecedence === MigrationService &&
        reference &&
        reference !== parsedFlavour;
      const finalFlavour =
        (preferReferenceFlavour ? reference : parsedFlavour) || fallbackFlavour;

      const current =
        Metadata["innerGet"](
          Symbol.for(
            [PersistenceKeys.MIGRATION, PersistenceKeys.BY_KEY].join("-")
          ),
          finalFlavour || DefaultFlavour
        ) || [];
      Metadata.set(
        [PersistenceKeys.MIGRATION, PersistenceKeys.BY_KEY].join("-"),
        finalFlavour || DefaultFlavour,
        [...current, { class: original }]
      );

      Metadata.set(PersistenceKeys.MIGRATION, reference, original);

      return metadata(PersistenceKeys.MIGRATION, {
        reference: reference || (original as Constructor).name,
        precedence: parsedPrecedence,
        flavour: finalFlavour || DefaultFlavour,
        rules: parsedRules,
      })(original);
    };
  }

  return Decoration.for(PersistenceKeys.MIGRATION)
    .define({
      decorator: innerMigration,
      args: [precedence, flavour, rules],
    })
    .apply();
}
