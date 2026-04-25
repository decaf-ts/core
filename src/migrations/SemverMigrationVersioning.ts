import { MigrationVersioning } from "./MigrationVersioning";
import * as semver from "semver";

export class SemverMigrationVersioning implements MigrationVersioning {
  private coerce(raw: string): string | undefined {
    const valid = semver.valid(raw);
    if (valid) return valid;
    return semver.coerce(raw)?.version;
  }

  private slug(raw: string): string {
    const fallback = (raw || "migration")
      .toLowerCase()
      .replace(/[^0-9a-z-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `0.0.0-${fallback || "migration"}`;
  }

  isVersionHint(value: string): boolean {
    return !!this.coerce(value);
  }

  normalize(reference: string, precedenceHint?: string): string {
    const refVersion = this.coerce(reference || "");
    const hintVersion = precedenceHint
      ? this.coerce(precedenceHint)
      : undefined;

    if (hintVersion) {
      const containsHint =
        (reference || "").includes(precedenceHint as string) ||
        (reference || "").includes(hintVersion);
      if (!refVersion || containsHint || refVersion === hintVersion) {
        return hintVersion;
      }
    }

    return refVersion || this.slug(reference || precedenceHint || "migration");
  }

  compare(a: string, b: string): number {
    return semver.compare(a, b);
  }

  gt(a: string, b: string): boolean {
    return semver.gt(a, b);
  }

  lte(a: string, b: string): boolean {
    return semver.lte(a, b);
  }
}
