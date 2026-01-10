import {
  Constructor,
  Decoration,
  DefaultFlavour,
  metadata,
  Metadata,
} from "@decaf-ts/decoration";
import { Migration, MigrationRule } from "./types";
import { PersistenceKeys } from "../persistence/constants";
import { MigrationService } from "../services/MigrationService";

export function migration(): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>> | null
): (target: object) => any;
export function migration(flavour: string): (target: object) => any;
export function migration(
  flavour: string,
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>>,
  flavour: string
): (target: object) => any;
export function migration(
  precedence: Constructor<Migration<any, any>>,
  flavour: string,
  rules?: MigrationRule[]
): (target: object) => any;
export function migration(
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
        PersistenceKeys.MIGRATION,
        (flavour as string) || DefaultFlavour,
        [
          ...current,
          {
            class: original,
          },
        ]
      );
      return metadata(PersistenceKeys.MIGRATION, {
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
