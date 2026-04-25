export interface MigrationVersioning {
  isVersionHint(value: string): boolean;
  normalize(reference: string, precedenceHint?: string): string;
  compare(a: string, b: string): number;
  gt(a: string, b: string): boolean;
  lte(a: string, b: string): boolean;
}
