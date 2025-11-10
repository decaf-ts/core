import "@decaf-ts/db-decorators";
import type { Transaction } from "@decaf-ts/transactional-decorators";

declare module "@decaf-ts/db-decorators" {
  interface RepositoryFlags {
    transaction?: Transaction<any>;
  }
}
