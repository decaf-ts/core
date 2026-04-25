declare module "semver" {
  export function valid(version: string): string | null;
  export function coerce(
    version: string
  ): {
    version: string;
  } | null;
  export function compare(version1: string, version2: string): number;
  export function lte(version1: string, version2: string): boolean;
  export function gt(version1: string, version2: string): boolean;
}

