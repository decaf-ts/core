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
  precedence?: Constructor<Migration<any, any>> | string | null,
  flavour?: string | MigrationRule[],
  rules?: MigrationRule[]
): (target: object) => any {
  function innerMigration(
    precedence?: Constructor<Migration<any, any>> | string | null,
    flavour?: string | MigrationRule[],
    rules?: MigrationRule[]
  ): (original: object) => void {
    return function (original: object) {
      const usedPrecedenceAsFlavour = typeof precedence === "string";
      const hasExplicitPrecedence =
        !usedPrecedenceAsFlavour && typeof precedence !== "undefined";

      let parsedPrecedence:
        | Constructor<Migration<any, any>>
        | string
        | null
        | undefined = precedence;
      let parsedFlavour: string | undefined;
      let parsedRules: MigrationRule[] | undefined;

      if (Array.isArray(flavour)) {
        parsedRules = flavour;
      } else {
        parsedFlavour = flavour;
        parsedRules = rules;
      }

      if (typeof precedence === "string") {
        parsedFlavour = precedence;
        parsedPrecedence = undefined;
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
