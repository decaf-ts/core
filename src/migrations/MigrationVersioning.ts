export interface MigrationVersioning {
  isVersionHint(value: string): boolean;
  normalize(reference: string, precedenceHint?: string): string;
  compare(a: string, b: string): number;
  gt(a: string, b: string): boolean;
  lte(a: string, b: string): boolean;
/**
 * Returns the base portion of a normalized version string with prerelease
 * and build identifiers stripped. If the versioning scheme cannot split the
 * version, returns `undefined` so callers treat the full version as its own base.
 *
 * @param version The full version string.
 * @returns The base version, or `undefined` when not applicable.
 */
  base?(version: string): string | undefined;
}
