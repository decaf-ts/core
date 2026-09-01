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

  base(version: string): string | undefined {
    /**
     * Returns the base version for the legacy strategy, which does not split
     * prerelease identifiers. The full version string is treated as its own
     * base, so identical versions are considered equal.
     *
     * @param version The version string.
     * @returns The same version string as the base.
     */
    return version;
  }

  gt(a: string, b: string): boolean {
    return this.compare(a, b) > 0;
  }

  lte(a: string, b: string): boolean {
    return this.compare(a, b) <= 0;
  }
}
