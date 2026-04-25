import { MigrationVersioning } from "./MigrationVersioning";

/**
 * Legacy non-semver migration ordering strategy.
 * Keeps references as-is and compares using lexical order.
 */
export class StandardMigrationVersioning implements MigrationVersioning {
  isVersionHint(value: string): boolean {
    return !!value;
  }

  normalize(reference: string, precedenceHint?: string): string {
    if (
      precedenceHint &&
      reference &&
      (reference.includes(precedenceHint) || reference === precedenceHint)
    ) {
      return precedenceHint;
    }
    return reference || precedenceHint || "migration";
  }

  compare(a: string, b: string): number {
    return a.localeCompare(b);
  }

  gt(a: string, b: string): boolean {
    return this.compare(a, b) > 0;
  }

  lte(a: string, b: string): boolean {
    return this.compare(a, b) <= 0;
  }
}
