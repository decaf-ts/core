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
  precedence: Constructor<Migration<any, any>> | string | null,
  flavour: string | MigrationRule[],
  rules: MigrationRule[]
): (target: object) => any {
  function innerMigration(
    precedence?: Constructor<Migration<any, any>> | string | null,
    flavour?: string | MigrationRule[],
    rules?: MigrationRule[]
  ): (original: object) => void {
    return function (original: object) {
      if (flavour && typeof flavour !== "string") {
        if (flavour && Array.isArray(flavour)) {
          rules = flavour;
          flavour = undefined;
        }
      }

      if (typeof precedence === "string") {
        flavour = precedence;
        precedence = undefined;
      }

      if (typeof precedence === "undefined" && precedence !== null)
        precedence = MigrationService;

      flavour =
        flavour ||
        Metadata.flavourOf(original as Constructor) ||
        (precedence === null ? flavour : undefined) ||
        undefined;

      const current =
        Metadata["innerGet"](
          Symbol.for(PersistenceKeys.MIGRATION),
          flavour || DefaultFlavour
        ) || [];
      Metadata.set(
        [PersistenceKeys.MIGRATION, PersistenceKeys.BY_KEY].join("-"),
        (flavour as string) || DefaultFlavour,
        [...current, original]
      );

      Metadata.set(PersistenceKeys.MIGRATION, reference, original);

      return metadata(PersistenceKeys.MIGRATION, {
        reference: reference || (original as Constructor).name,
        precedence: precedence,
        flavour: flavour || DefaultFlavour,
        rules: rules,
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
