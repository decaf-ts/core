import { DefaultAdapterFlags } from "../persistence/constants";
import { MigrationConfig } from "./types";

export const DefaultMigrationConfig: MigrationConfig<true> = Object.assign(
  {},
  DefaultAdapterFlags,
  {
    persistMigrationSteps: true,
  }
) as MigrationConfig<true>;
